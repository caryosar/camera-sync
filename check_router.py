"""check_router.py

Utility script that uses the ``BrowserHelper`` class to log into the TP‑Link
TC‑W7960 router (http://192.168.1.1) and dump the relevant configuration pages
as plain text. The output can be inspected to verify:

1. DHCP server is enabled and the address pool.
2. DHCP client lease table (look for the laptop Wi‑Fi MAC).
3. Wireless → Advanced → AP Isolation status.
4. Whether wireless clients are bridged to the LAN.
5. LAN IP address and subnet.

The script makes no assumptions about the exact UI layout – it navigates by
URL fragments that are typical for TP‑Link firmware. If a page cannot be
found the exception is caught and the error is printed so you can adjust the
URL or selector.
"""

from browser_helper import BrowserHelper
import re

# Router credentials – replace if you have custom ones.
USERNAME = "admin"
PASSWORD = "admin"
BASE_URL = "http://192.168.1.1"

def print_section(title: str, content: str) -> None:
    print(f"\n{'='*10} {title} {'='*10}\n")
    print(content)

def main() -> None:
    with BrowserHelper() as bh:
        # 1. Open the router UI
        bh.navigate(BASE_URL)
        # Attempt login – most TP‑Link firmwares use input[name='username']
        # and input[name='password'] on the first page.
        try:
            bh.fill('input[name="username"]', USERNAME)
            bh.fill('input[name="password"]', PASSWORD)
            bh.click('button[type="submit"]')
        except Exception:
            # If login fields are not present we may already be logged in.
            pass

        # Helper to fetch page text after navigating to a relative URL.
        def fetch(relative: str, title: str) -> None:
            try:
                bh.navigate(f"{BASE_URL}{relative}")
                txt = bh.get_page_text()
                print_section(title, txt)
            except Exception as e:
                print_section(title, f"Error loading {relative}: {e}")

        # 2. DHCP Server page – typical path /dhcp.htm
        fetch('/dhcp.htm', 'DHCP Server Settings')

        # 3. DHCP Client List – often /dhcp_client.htm or /dhcp_clients.htm
        fetch('/dhcp_client.htm', 'DHCP Client Lease Table')

        # 4. Wireless Advanced – path /wireless_advanced.htm
        fetch('/wireless_advanced.htm', 'Wireless Advanced (AP Isolation)')

        # 5. LAN Settings – path /lan.htm
        fetch('/lan.htm', 'LAN Settings')

        # 6. Wireless Settings – path /wireless.htm (to see bridge mode)
        fetch('/wireless.htm', 'Wireless Settings (Bridge Mode)')

if __name__ == "__main__":
    main()
