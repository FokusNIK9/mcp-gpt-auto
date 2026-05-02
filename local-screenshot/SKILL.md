---
name: local-screenshot
description: Capture and visually analyze the local screen on Windows. Use this skill when asked to see what is on the screen, check UI state, or troubleshoot visual errors on the local machine.
---

# Local Screenshot Skill

This skill allows Gemini CLI to capture a screenshot of the local Windows primary monitor and load it into context for visual analysis.

## Workflow

1. **Capture the Screen**:
   Execute the bundled PowerShell script using the `run_shell_command` tool. This will capture the screen and save it as a PNG file.

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File "[PATH_TO_SKILL_DIR]\scripts\capture.ps1"
   ```
   *Note: The script outputs the path where the screenshot was saved (default is `$env:TEMP\gemini-screenshot.png`).*

2. **Load and Analyze**:
   Use the `read_file` tool to load the captured `.png` file. You can then analyze the image to answer the user's question.

3. **Report**:
   Provide the user with a description of what you see on the screen.

## Important Notes

- This skill relies on PowerShell and `.NET` assemblies (`System.Windows.Forms`, `System.Drawing`), which are native to Windows.
- Always use the `read_file` tool to process the image; do not attempt to read binary data directly via the terminal.
- Replace `[PATH_TO_SKILL_DIR]` with the actual absolute path to this skill's directory.
