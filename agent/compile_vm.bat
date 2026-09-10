@echo off
REM Compile the Windows HTTP beacon. Run this INSIDE the VM, not on the host.
REM Needs MSVC: "x64 Native Tools Command Prompt" or vcvars64.bat first.
cl /nologo /O2 /GS- /DNDEBUG agent.cpp /Fe:agent.exe /link /SUBSYSTEM:WINDOWS /OPT:ICF /OPT:REF user32.lib kernel32.lib
if errorlevel 1 exit /b 1
echo built agent.exe — wrap THIS file in the dashboard, not data\files\agent.exe
dir agent.exe
