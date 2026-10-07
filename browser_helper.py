'''browser_helper.py

Utility wrapper around Playwright for simple browser automation.

The project already includes a Playwright MCP server configuration in
`mcp.json`:
```json
{
  "servers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headed"]
    }
  }
}
```
This helper uses the synchronous Playwright API (``playwright.sync_api``)
so it can be used directly from scripts or tests without async boilerplate.

Typical usage::

    from browser_helper import BrowserHelper

    with BrowserHelper() as bh:
        bh.navigate('http://192.168.1.1/index.htm')
        bh.fill('input[name="username"]', 'admin')
        bh.fill('input[name="password"]', 'admin')
        bh.click('button[type="submit"]')
        text = bh.get_page_text()
        print(text)

The class provides the following high‑level methods:
* ``navigate(url)`` – go to a URL.
* ``click(selector)`` – click an element identified by a CSS selector.
* ``fill(selector, text)`` – fill a form field.
* ``get_page_text()`` – return the full visible page text (useful for
  snapshots when a visual screenshot is not required).

All actions raise ``PlaywrightError`` (or a subclass) if the selector is not
found or the operation fails, making debugging straightforward.
''' 

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

class BrowserHelper:
    """Simple wrapper around Playwright for navigation and interaction.

    The helper manages the Playwright ``Browser`` and ``Page`` objects via a
    context manager so resources are cleaned up automatically.
    """

    def __init__(self, headless: bool = False, timeout: int = 30_000):
        """Create a new ``BrowserHelper``.

        Args:
            headless: Run the browser in headless mode when ``True``.
            timeout: Default timeout (in ms) for actions like ``click`` and
                ``fill``. 30 seconds is a reasonable default for router UI
                interactions.
        """
        self.headless = headless
        self.timeout = timeout
        self._playwright = None
        self._browser = None
        self._page = None

    def __enter__(self):
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(headless=self.headless)
        self._page = self._browser.new_page()
        self._page.set_default_timeout(self.timeout)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._page:
            self._page.close()
        if self._browser:
            self._browser.close()
        if self._playwright:
            self._playwright.stop()
        # Do not suppress exceptions
        return False

    def navigate(self, url: str) -> None:
        """Navigate to ``url``.

        Raises:
            PlaywrightTimeoutError: If the navigation does not complete within
                the configured timeout.
        """
        self._page.goto(url)

    def click(self, selector: str) -> None:
        """Click the element identified by ``selector``.

        Args:
            selector: CSS selector for the target element.
        """
        self._page.click(selector)

    def fill(self, selector: str, text: str) -> None:
        """Fill a form field identified by ``selector`` with ``text``.

        Args:
            selector: CSS selector for the input element.
            text: Text to type into the field.
        """
        self._page.fill(selector, text)

    def get_page_text(self) -> str:
        """Return the full visible text of the current page.

        This is useful for snapshot‑style verification when a graphical
        screenshot is not required.
        """
        return self._page.inner_text('body')

    # Additional convenience methods can be added as needed, e.g.
    # ``wait_for_selector``, ``screenshot``, or ``evaluate``.
