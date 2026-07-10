"""
Test cho NLP Analyzer Service (/ner + /health).

Mock underthesea.ner (import vào main dưới tên `main.ner`) để test CHỈ kiểm tra logic
gộp cụm B-/I- + filter MISC của mình — tất định, nhanh, không tải model thật.
Xác minh model thật để dành smoke thủ công (Step 6).
"""
from fastapi.testclient import TestClient
from unittest.mock import patch

# from main import app — main.py chưa có nên dòng này ĐỎ lúc đầu (đúng ý TDD, test phải fail)
from main import app

# TestClient bọc app FastAPI: gọi HTTP giả lập trong bộ nhớ, không cần chạy server thật
client = TestClient(app)


def test_health():
    # Health-check: NestJS/Docker ping để biết service còn sống
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


@patch("main.ner")
def test_ner_gop_cum(mock_ner):
    # Giả lập đầu ra underthesea: mỗi tuple = (word, pos, chunk, ner_tag). Code chỉ đọc [0] và [3].
    mock_ner.return_value = [
        ("Nguyễn", "Np", "B-NP", "B-PER"),
        ("Văn", "Np", "I-NP", "I-PER"),
        ("A", "Np", "I-NP", "I-PER"),
        ("ở", "E", "O", "O"),
        ("Nha", "Np", "B-NP", "B-LOC"),
        ("Trang", "Np", "I-NP", "I-LOC"),
    ]
    res = client.post("/ner", json={"text": "bất kỳ"})
    assert res.status_code == 200
    # B-/I- cùng loại gộp thành 1 cụm; token "ở" (tag O) bị bỏ ngoài entity
    assert res.json()["entities"] == [
        {"text": "Nguyễn Văn A", "type": "PER"},
        {"text": "Nha Trang", "type": "LOC"},
    ]


@patch("main.ner")
def test_bo_misc(mock_ner):
    # Có 1 cụm MISC (tên sự kiện) + 1 cụm ORG → chỉ ORG được giữ, MISC bị lọc
    mock_ner.return_value = [
        ("SEA", "Np", "B-NP", "B-MISC"),
        ("Games", "Np", "I-NP", "I-MISC"),
        ("Công", "Np", "B-NP", "B-ORG"),
        ("an", "N", "I-NP", "I-ORG"),
        ("Khánh", "Np", "I-NP", "I-ORG"),
        ("Hòa", "Np", "I-NP", "I-ORG"),
    ]
    res = client.post("/ner", json={"text": "bất kỳ"})
    assert res.status_code == 200
    assert res.json()["entities"] == [
        {"text": "Công an Khánh Hòa", "type": "ORG"},
    ]


@patch("main.ner")
def test_text_rong(mock_ner):
    # Text rỗng → trả sớm [], KHÔNG gọi model (tiết kiệm + tránh gọi ner(None/""))
    res = client.post("/ner", json={"text": ""})
    assert res.status_code == 200
    assert res.json() == {"entities": []}
    mock_ner.assert_not_called()
