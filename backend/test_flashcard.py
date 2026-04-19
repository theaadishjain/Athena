import urllib.request
import json
import time

url = "http://127.0.0.1:8000/chat"
payload = json.dumps({
    "user_id": "test",
    "session_id": "s1",
    "input": "create flashcards on photosynthesis"
}).encode("utf-8")

for attempt in range(1, 11):
    print(f"--- Attempt {attempt} ---")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("status") == "success" and data.get("flashcards"):
                with open("real_output.json", "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                print("SUCCESS - real flashcards received")
                exit(0)
            else:
                msg = data.get("response", "unknown")
                print(f"Got error response: {msg}")
                print("Waiting 65 seconds for rate limit reset...")
                time.sleep(65)
    except Exception as e:
        print(f"Exception: {e}")
        time.sleep(10)

print("FAILED after 10 attempts")
exit(1)
