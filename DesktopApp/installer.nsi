
!include "MUI2.nsh"

Name "Bet Automation"
OutFile "BetAutomation_Setup.exe"
InstallDir "$PROGRAMFILES\BetAutomation"
RequestExecutionLevel admin

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

Section "Install"
    SetOutPath "$INSTDIR"
    File "dist\BetAutomation.exe"
    File "macro_config.json"
    
    CreateDirectory "$INSTDIR\assets"
    SetOutPath "$INSTDIR\assets"
    File /r "assets\*"
    
    WriteUninstaller "$INSTDIR\Uninstall.exe"
    
    CreateDirectory "$SMPROGRAMS\BetAutomation"
    CreateShortCut "$SMPROGRAMS\BetAutomation\BetAutomation.lnk" "$INSTDIR\BetAutomation.exe"
    CreateShortCut "$SMPROGRAMS\BetAutomation\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
    CreateShortCut "$DESKTOP\BetAutomation.lnk" "$INSTDIR\BetAutomation.exe"
    
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BetAutomation" "DisplayName" "Bet Automation"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BetAutomation" "UninstallString" "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
    Delete "$INSTDIR\BetAutomation.exe"
    Delete "$INSTDIR\macro_config.json"
    RMDir /r "$INSTDIR\assets"
    Delete "$INSTDIR\Uninstall.exe"
    RMDir "$INSTDIR"
    
    Delete "$SMPROGRAMS\BetAutomation\BetAutomation.lnk"
    Delete "$SMPROGRAMS\BetAutomation\Uninstall.lnk"
    RMDir "$SMPROGRAMS\BetAutomation"
    Delete "$DESKTOP\BetAutomation.lnk"
    
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BetAutomation"
SectionEnd
