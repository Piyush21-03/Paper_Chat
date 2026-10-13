from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from auth import get_current_user
from db import get_db
from models import Conversation, Document, Message, User
from schemas import (
    ConversationCreate,
    ConversationDetailOut,
    ConversationListResponse,
    ConversationOut,
    ConversationRenameRequest,
    MessageOut,
)

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


def _not_found():
    return JSONResponse(status_code=404, content={"success": False, "message": "Conversation not found."})


def _get_owned(db: Session, conversation_id: str, user: User) -> Optional[Conversation]:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None or conversation.user_id != user.id:
        return None
    return conversation


@router.post("")
def create_conversation(
    payload: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    document_ids = payload.document_ids or []

    # SECURITY: a conversation may only be scoped to documents the
    # caller actually owns -- otherwise its document_ids would let
    # /ask retrieve another user's vectors.
    if document_ids:
        owned_count = (
            db.query(Document)
            .filter(Document.id.in_(document_ids), Document.user_id == current_user.id)
            .count()
        )
        if owned_count != len(set(document_ids)):
            return JSONResponse(
                status_code=403,
                content={"success": False, "message": "One or more documents are not accessible."},
            )

    conversation = Conversation(
        user_id=current_user.id,
        title=(payload.title or "New chat").strip() or "New chat",
        document_ids=document_ids,
    )

    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    return {"success": True, "conversation": ConversationOut.model_validate(conversation)}


@router.get("", response_model=ConversationListResponse)
def list_conversations(
    document_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    query = db.query(Conversation).filter(Conversation.user_id == current_user.id)
    conversations = query.order_by(Conversation.updated_at.desc()).all()

    if document_id:
        conversations = [c for c in conversations if document_id in (c.document_ids or [])]

    return {
        "success": True,
        "conversations": [ConversationOut.model_validate(c) for c in conversations],
    }


@router.get("/{conversation_id}")
def get_conversation(conversation_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    conversation = _get_owned(db, conversation_id, current_user)
    if conversation is None:
        return _not_found()

    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .all()
    )

    detail = ConversationDetailOut(
        **ConversationOut.model_validate(conversation).model_dump(),
        messages=[MessageOut.model_validate(m) for m in messages],
    )

    return {"success": True, "conversation": detail}


@router.patch("/{conversation_id}")
def rename_conversation(
    conversation_id: str,
    payload: ConversationRenameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    conversation = _get_owned(db, conversation_id, current_user)
    if conversation is None:
        return _not_found()

    conversation.title = payload.title.strip()
    db.commit()
    db.refresh(conversation)

    return {"success": True, "conversation": ConversationOut.model_validate(conversation)}


@router.delete("/{conversation_id}")
def delete_conversation(conversation_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    conversation = _get_owned(db, conversation_id, current_user)
    if conversation is None:
        return _not_found()

    # Deleting a conversation only removes its own messages -- the
    # documents it referenced are untouched.
    db.query(Message).filter(Message.conversation_id == conversation_id).delete()
    db.delete(conversation)
    db.commit()

    return {"success": True, "message": "Conversation deleted."}
