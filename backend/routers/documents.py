import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile, File, Query
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from auth import get_current_user
from config import settings
from db import get_db
from models import Document, ExtractedTable, User
from schemas import (
    DocumentListResponse,
    DocumentOut,
    RenameRequest,
    TableListResponse,
    TableOut,
    UploadResponse,
)
from jobs import is_processing
import job_queue
from rag import delete_document_vectors
import tables as tables_module
from logging_config import get_logger

logger = get_logger("documents_router")

router = APIRouter(prefix="/api/documents", tags=["documents"])

BACKEND_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BACKEND_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


def _not_found():
    return JSONResponse(status_code=404, content={"success": False, "message": "Document not found."})


def _get_owned(db: Session, document_id: str, user: User) -> Optional[Document]:
    """Fetches a document only if it belongs to `user`. Returns None
    both when the document doesn't exist and when it belongs to someone
    else -- callers must not distinguish the two (avoid leaking existence
    of other users' documents)."""

    document = db.get(Document, document_id)
    if document is None or document.user_id != user.id:
        return None
    return document


# ========================================
# Upload
# ========================================

@router.post("/upload", response_model=UploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    if not file.filename:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "No file selected."},
        )

    if not file.filename.lower().endswith(".pdf"):
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "Only PDF files are supported."},
        )

    file_content = await file.read()
    file_size = len(file_content)

    if file_size > settings.max_upload_bytes:
        return JSONResponse(
            status_code=413,
            content={
                "success": False,
                "message": f"File is too large. Maximum allowed size is {settings.MAX_UPLOAD_MB} MB.",
            },
        )

    if file_size == 0:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "The uploaded file is empty."},
        )

    # SECURITY: validate actual file content, not just the extension --
    # a real PDF always starts with the "%PDF" magic bytes.
    if file_content[:4] != b"%PDF":
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "This file does not look like a valid PDF."},
        )

    # SECURITY: never use the client-supplied filename as a disk path.
    # Store under a generated UUID; keep the original name only as a
    # display label in the database.
    document_id = str(uuid.uuid4())
    stored_filename = f"{document_id}.pdf"
    file_path = UPLOAD_DIR / stored_filename

    try:
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)
    except Exception as error:
        logger.error("file save error: %s", error)
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "Unable to save the uploaded file."},
        )

    document = Document(
        id=document_id,
        user_id=current_user.id,
        original_filename=file.filename,
        stored_filename=stored_filename,
        file_size_bytes=file_size,
        status="uploaded",
    )

    db.add(document)
    db.commit()
    db.refresh(document)

    # Indexing happens in the background; the client polls status via
    # GET /api/documents or GET /api/documents/{id}.
    job_queue.enqueue_document_processing(background_tasks, document.id, file_path)

    logger.info("document uploaded document_id=%s user_id=%s size=%d", document.id, current_user.id, file_size)

    return {
        "success": True,
        "message": "Upload received. Processing started.",
        "document": DocumentOut.model_validate(document),
    }


# ========================================
# List / Search
# ========================================

@router.get("", response_model=DocumentListResponse)
def list_documents(
    search: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    query = db.query(Document).filter(Document.user_id == current_user.id)

    if search:
        query = query.filter(
            or_(Document.original_filename.ilike(f"%{search}%"))
        )

    documents = query.order_by(Document.created_at.desc()).all()

    return {
        "success": True,
        "documents": [DocumentOut.model_validate(doc) for doc in documents],
    }


# ========================================
# Get One (status polling)
# ========================================

@router.get("/{document_id}")
def get_document(document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    document = _get_owned(db, document_id, current_user)
    if document is None:
        return _not_found()

    return {"success": True, "document": DocumentOut.model_validate(document)}


# ========================================
# Rename
# ========================================

@router.patch("/{document_id}")
def rename_document(
    document_id: str,
    payload: RenameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    document = _get_owned(db, document_id, current_user)
    if document is None:
        return _not_found()

    document.original_filename = payload.filename.strip()
    db.commit()
    db.refresh(document)

    return {"success": True, "document": DocumentOut.model_validate(document)}


# ========================================
# Delete
# ========================================

@router.delete("/{document_id}")
def delete_document(document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    document = _get_owned(db, document_id, current_user)
    if document is None:
        return _not_found()

    file_path = UPLOAD_DIR / document.stored_filename

    if file_path.exists():
        try:
            file_path.unlink()
        except Exception as error:
            logger.warning("file delete error: %s", error)

    delete_document_vectors(document_id)

    # Clean up extracted tables (DB rows + on-disk CSV/XLSX files).
    db.query(ExtractedTable).filter(
        ExtractedTable.document_id == document_id
    ).delete()

    table_dir = tables_module.TABLES_DIR / document_id
    if table_dir.exists():
        shutil.rmtree(table_dir, ignore_errors=True)

    db.delete(document)
    db.commit()

    return {"success": True, "message": "Document deleted."}


# ========================================
# Retry (re-process a failed document)
# ========================================

@router.post("/{document_id}/retry")
def retry_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    document = _get_owned(db, document_id, current_user)
    if document is None:
        return _not_found()

    if is_processing(document_id):
        return JSONResponse(
            status_code=409,
            content={"success": False, "message": "This document is already being processed."},
        )

    file_path = UPLOAD_DIR / document.stored_filename

    if not file_path.exists():
        return JSONResponse(
            status_code=404,
            content={"success": False, "message": "Original file is missing on disk; please re-upload."},
        )

    document.status = "uploaded"
    document.error_message = None
    document.failed_stage = None
    document.processing_stage = None
    db.commit()

    logger.info("retry requested document_id=%s user_id=%s", document_id, current_user.id)
    job_queue.enqueue_document_processing(background_tasks, document.id, file_path)

    return {"success": True, "document": DocumentOut.model_validate(document)}


# ========================================
# Serve PDF File
# ========================================

@router.get("/{document_id}/file")
def get_document_file(document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    document = _get_owned(db, document_id, current_user)
    if document is None:
        return _not_found()

    # Only ever serve the file via its DB-known stored_filename -- never
    # accept a client-supplied path.
    file_path = UPLOAD_DIR / document.stored_filename

    if not file_path.exists():
        return JSONResponse(
            status_code=404,
            content={"success": False, "message": "File is missing on disk."},
        )

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=document.original_filename,
        headers={"Content-Disposition": "inline"},
    )


# ========================================
# Tables
# ========================================

@router.get("/{document_id}/tables", response_model=TableListResponse)
def list_document_tables(document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    document = _get_owned(db, document_id, current_user)
    if document is None:
        return _not_found()

    rows = (
        db.query(ExtractedTable)
        .filter(ExtractedTable.document_id == document_id)
        .order_by(ExtractedTable.page_number.asc())
        .all()
    )

    tables = [
        TableOut(
            id=row.id,
            document_id=row.document_id,
            page_number=row.page_number,
            row_count=row.row_count,
            col_count=row.col_count,
            preview=row.preview,
            has_xlsx=bool(row.xlsx_path),
        )
        for row in rows
    ]

    return {"success": True, "tables": tables}


@router.get("/{document_id}/tables/{table_id}/csv")
def download_table_csv(document_id: str, table_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    document = _get_owned(db, document_id, current_user)
    if document is None:
        return _not_found()

    row = db.get(ExtractedTable, table_id)

    if row is None or row.document_id != document_id:
        return JSONResponse(
            status_code=404,
            content={"success": False, "message": "Table not found."},
        )

    csv_path = Path(row.csv_path)

    if not csv_path.exists():
        return JSONResponse(
            status_code=404,
            content={"success": False, "message": "CSV file is missing on disk."},
        )

    return FileResponse(
        path=csv_path,
        media_type="text/csv",
        filename=f"table_page{row.page_number}.csv",
    )


@router.get("/{document_id}/tables/{table_id}/xlsx")
def download_table_xlsx(document_id: str, table_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    document = _get_owned(db, document_id, current_user)
    if document is None:
        return _not_found()

    row = db.get(ExtractedTable, table_id)

    if row is None or row.document_id != document_id:
        return JSONResponse(
            status_code=404,
            content={"success": False, "message": "Table not found."},
        )

    if not row.xlsx_path or not Path(row.xlsx_path).exists():
        return JSONResponse(
            status_code=404,
            content={"success": False, "message": "XLSX file is not available for this table."},
        )

    return FileResponse(
        path=Path(row.xlsx_path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=f"table_page{row.page_number}.xlsx",
    )
