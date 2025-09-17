# Server Notes for Sign Template Maker

## How to Run the Text Wrap Manual Demo

### Correct Way to Serve the Files

When serving the `text-wrap-manual.html` file, you need to ensure the server is configured correctly:

1. **From project root directory:**

    ```bash
    npx http-server -p 8081 -c-1
    ```

    Then access at: `http://localhost:8081/sign-template-maker/text-wrap-manual.html`

2. **Alternative - from sign-template-maker directory:**
    ```bash
    cd sign-template-maker
    python -m http.server 8080
    ```
    Then access at: `http://localhost:8080/text-wrap-manual.html`

### Common Issues and Solutions

#### Issue: Page returns ERR_EMPTY_RESPONSE

- **Cause:** Wrong URL path or port conflicts
- **Solution:** Make sure to include the full path including subdirectory when serving from root

#### Issue: 404 errors for LibLouis files

- **Expected:** The LibLouis files (`lib/liblouis/easy-api.js` and `lib/liblouis/build-no-tables-utf16.js`) are optional
- **Behavior:** The app gracefully falls back to the JavaScript-based Grade 2 braille translation in `braille-grade2.js`

### Required Files

- `text-wrap-manual.html` - Main application
- `braille-grade2.js` - Fallback braille translation
- `BRAILLE.TTF` - Braille font file

### Debugging

To open with Chrome DevTools access:

```bash
start chrome --remote-debugging-port=9222 --user-data-dir=temp-profile "http://localhost:8081/sign-template-maker/text-wrap-manual.html"
```

### Important Notes

- Always verify the full URL path matches the directory structure from where the server is running
- The app works fine without LibLouis - it uses a fallback Grade 2 braille translation system
- Port 8081 is recommended to avoid conflicts with other development servers
