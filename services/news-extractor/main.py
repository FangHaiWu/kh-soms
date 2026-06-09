"""
News Extractor Service — microservice Python bóc nội dung bài báo.

Mục đích: phục vụ các báo KHÔNG có RSS (vd baokhanhhoa.vn). NestJS gửi URL bài
sang đây, service dùng trafilatura bóc title/content/author/date rồi trả JSON.
Tách Python riêng vì trafilatura (extractor tốt nhất cho tiếng Việt) là thư viện Python.

Chạy: uvicorn main:app --port 8000   (hoặc python main.py)
"""
import json
import trafilatura
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# Khởi tạo FastAPI app — title/version hiển thị ở trang docs tự sinh /docs
app = FastAPI(title="News Extractor Service", version="1.0.0")


# Schema request: client BẮT BUỘC gửi field "url" (Pydantic tự validate kiểu)
class ExtractRequest(BaseModel):
    url: str


@app.get('/health')
async def health():
    # Endpoint health-check: NestJS/Docker ping để biết service còn sống
    return {'status': 'ok'}


@app.post('/extract')
async def extract(req: ExtractRequest):
    """
    Bóc nội dung 1 bài báo từ URL.
    Flow: tải HTML → bóc nội dung (trafilatura) → parse JSON → map về response chuẩn.
    Thành công → 200 + {title, content, author, publishedDate, url}.
    Thất bại → ném HTTPException với status đúng nghĩa: 502 (tải nguồn lỗi),
    422 (không bóc được nội dung), 500 (lỗi bất ngờ). Body lỗi = {detail}.
    """
    try:
        # 1. Tải HTML trang về (trafilatura tự xử lý header/redirect). None = tải thất bại
        downloaded = trafilatura.fetch_url(req.url)
        if not downloaded:
            # Không tải được trang → báo lỗi sớm, khỏi bóc tiếp
            raise HTTPException(status_code=502, detail="Không tải được URL")

        # 2. Bóc nội dung chính: with_metadata=True để lấy kèm title/author/date,
        #    output_format='json' để trả chuỗi JSON có cấu trúc (dễ parse hơn text thuần)
        extracted = trafilatura.extract(
            downloaded, output_format='json', with_metadata=True
        )
        if not extracted:
            # Tải được trang nhưng không bóc ra nội dung (vd trang rỗng/chỉ ảnh)
            raise HTTPException(status_code=422, detail="Không thể bóc được nội dung bài viết")

        # 3. Chuỗi JSON của trafilatura → dict Python để bốc từng field
        data = json.loads(extracted)

        # 4. Map về schema chung. LƯU Ý: body nằm ở key 'text' của trafilatura,
        #    nhưng response đặt là 'content' cho khớp RawPost.content phía NestJS
        return {
            "title": data.get('title'),
            "content": data.get('text'),
            "author": data.get('author'),
            "publishedDate": data.get("date"),
            "url": req.url
        }
    except HTTPException:
        # Cho HTTPException (502/422 ở trên) đi tiếp ĐÚNG status,
        # KHÔNG để nhánh Exception bên dưới nuốt mất rồi đổi thành 500
        raise
    except Exception as e:
        # Mọi lỗi bất ngờ còn lại (parse JSON hỏng, bug...) → 500 Internal Server Error.
        # Bridge NestJS bắt non-2xx này, coi như bài hỏng → bỏ qua, đi tiếp (không sập mẻ crawl).
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # Chạy trực tiếp bằng `python main.py`. Dùng import-string "main:app" để bật reload
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
