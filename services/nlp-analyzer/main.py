"""
NLP Analyzer Service — microservice Python phân tích NLP tiếng Việt cho pipeline OSINT.

Đợt này (S5b): NER (Named Entity Recognition) bằng underthesea. NestJS gửi text đã
normalize sang đây, service bóc thực thể (người/tổ chức/địa danh) rồi trả JSON để điền
cột osint_post_nlp.entities (nuôi entity-resolution Zone B). CPU-only, không GPU.

Sentiment (PhoBERT) để dành S5b-2. Chạy: uvicorn main:app --port 8001
"""
from fastapi import FastAPI
from pydantic import BaseModel

# Import kiểu `from underthesea import ner` → test patch "main.ner" mới trúng. KHÔNG đổi.
from underthesea import ner

# title/version hiển thị ở trang docs tự sinh /docs
app = FastAPI(title="NLP Analyzer Service", version="1.0.0")

# Chỉ giữ 3 loại thực thể có giá trị cho Zone B; MISC (sự kiện/quốc tịch/sản phẩm...) bị bỏ vì nhiễu
KEEP_TYPES = {"PER", "ORG", "LOC"}


# Schema request: client BẮT BUỘC gửi field "text" (Pydantic tự validate kiểu str)
class NerRequest(BaseModel):
    text: str


@app.get("/health")
async def health():
    # Health-check: NestJS/Docker ping để biết service còn sống
    return {"status": "ok"}


def _merge_entities(tagged: list) -> list:
    """
    Gộp chuỗi token IOB của underthesea thành các cụm entity hoàn chỉnh.

    Input: list tuple (word, pos, chunk, ner_tag); chỉ đọc word=[0], ner_tag=[3].
    ner_tag dạng IOB: B-XXX mở cụm mới, I-XXX nối cụm cùng loại, O = ngoài entity.
    Output: list dict {"text", "type"} chỉ gồm PER/ORG/LOC (MISC bị lọc).

    Flow: duyệt token → giữ 1 "cụm đang mở" → gặp ranh giới thì chốt cụm vào kết quả.
    """
    entities: list = []
    current = None  # cụm đang mở: {"tokens": [...], "type": "PER"} hoặc None

    def flush():
        # Chốt cụm đang mở vào kết quả rồi đóng lại
        nonlocal current
        if current:
            entities.append(
                {"text": " ".join(current["tokens"]), "type": current["type"]}
            )
            current = None

    for token in tagged:
        word = token[0]
        tag = token[3]

        # Tách prefix (B/I/O) + type (PER/ORG/LOC/MISC). "O" không có type.
        parts = tag.split("-")
        prefix = parts[0]
        etype = parts[1] if len(parts) == 2 else None

        # Token ngoài entity, hoặc entity loại không giữ (MISC) → chốt cụm cũ, không mở cụm mới
        if prefix == "O" or etype not in KEEP_TYPES:
            flush()
            continue

        # I-XXX nối tiếp đúng cụm đang mở cùng loại → gộp token vào cụm
        if prefix == "I" and current is not None and current["type"] == etype:
            current["tokens"].append(word)
        else:
            # B-XXX (mở cụm mới), hoặc I-XXX lạc (không có B trước / khác loại) → coi như mở cụm mới
            flush()
            current = {"tokens": [word], "type": etype}

    # Cạm bẫy: nhớ chốt cụm cuối nếu văn bản kết thúc ngay trong một entity
    flush()
    return entities


@app.post("/ner")
async def extract_ner(req: NerRequest):
    """
    Bóc thực thể PER/ORG/LOC từ 1 đoạn text tiếng Việt.
    Flow: text rỗng → []; ngược lại underthesea.ner → gộp cụm IOB → trả {entities}.
    """
    # Text rỗng/chỉ khoảng trắng → trả sớm, KHÔNG gọi model (tiết kiệm + tránh ner("") lỗi)
    if not req.text or not req.text.strip():
        return {"entities": []}

    # underthesea NER: trả list tuple (word, pos, chunk, ner_tag)
    tagged = ner(req.text)
    return {"entities": _merge_entities(tagged)}
