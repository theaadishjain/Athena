import asyncio
import httpx

async def main():
    async with httpx.AsyncClient() as client:
        # We don't have a valid token, so we'll just send a dummy one
        # to see if it reaches the route at all or fails at Auth
        headers = {"Authorization": "Bearer dummy_token"}
        files = {"file": ("test.txt", b"Hello world", "text/plain")}
        data = {"session_id": "1234-5678"}
        
        response = await client.post(
            "http://localhost:8000/summarize",
            headers=headers,
            data=data,
            files=files
        )
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")

if __name__ == "__main__":
    asyncio.run(main())
