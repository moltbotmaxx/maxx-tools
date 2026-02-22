import os
import subprocess
import time
from datetime import datetime

# Configuration
WORKSPACE = "/Users/maxx/.openclaw/workspace"
PROJECT_DIR = os.path.join(WORKSPACE, "projects", "smart-frame")
LATEST_PNG = os.path.join(PROJECT_DIR, "Dashboard_Latest.png")
COUNTER_FILE = os.path.join(PROJECT_DIR, "upload_counter.txt")

FTP_HOST = "192.168.100.12"
FTP_PORT = "2221"

def get_next_frame_number():
    if not os.path.exists(COUNTER_FILE):
        with open(COUNTER_FILE, "w") as f:
            f.write("1")
        return 1
    
    with open(COUNTER_FILE, "r") as f:
        try:
            val = int(f.read().strip())
        except:
            val = 0
    
    next_val = val + 1
    with open(COUNTER_FILE, "w") as f:
        f.write(str(next_val))
    return next_val

def sync_strict():
    print(f"[{datetime.now()}] 🛡️ Initiating LEAN SEQUENTIAL SYNC (Keeping 2 Most Recent)...")
    
    if not os.path.exists(LATEST_PNG):
        print(f"❌ Error: {LATEST_PNG} not found.")
        return

    try:
        # 1. Get next sequence number
        frame_num = get_next_frame_number()
        # Format with leading zeros to match your current pattern Frame_000000X.png
        final_filename = f"Frame_{frame_num:07d}.png"
        
        print(f"Targeting: {final_filename}")

        # 2. Upload DIRECTLY to the final name (No renaming to avoid corruption-during-move)
        # Note: By uploading directly, if the frame reads during upload, it might see corruption,
        # but your previous test suggests renaming itself might be the issue.
        # We will use curl for a clean stream.
        subprocess.check_call([
            'curl', '-s', '-T', LATEST_PNG, 
            f'ftp://{FTP_HOST}:{FTP_PORT}/{final_filename}'
        ])
        print(f"Uploaded: {final_filename}")

        # 3. Cleanup: Keep only the 2 highest numbered frames
        print("Auditing FTP for sequence cleanup...")
        # Get list of files
        res = subprocess.check_output(['lftp', '-c', f'open ftp://{FTP_HOST}:{FTP_PORT}; nlist'], text=True)
        files = [f.strip() for f in res.split('\n') if f.strip().startswith('Frame_') and f.endswith('.png')]
        
        # Sort files based on the numeric part
        files.sort() 

        if len(files) > 2:
            to_delete = files[:-2] # Everything except the last 2
            print(f"Deleting {len(to_delete)} stale frames...")
            for f in to_delete:
                subprocess.call(['lftp', '-c', f'open ftp://{FTP_HOST}:{FTP_PORT}; rm {f}'])
                print(f"  - Purged: {f}")

        print(f"✅ Sync Complete. Current buffer: {files[-2:] if len(files) >= 2 else files}")

    except Exception as e:
        print(f"❌ LEAN SYNC FAILED: {e}")

if __name__ == "__main__":
    sync_strict()
