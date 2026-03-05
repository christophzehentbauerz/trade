import sys
import platform

print(f"Detected Python Version: {platform.python_version()}")

if sys.version_info >= (3, 14):
    print("ERROR: Python 3.14 detected. This version is too new.")
    sys.exit(1)
    
if sys.version_info < (3, 10):
    print("WARNING: Python version is older than 3.10. Recommended 3.10+")

sys.exit(0)
