Set WshShell = CreateObject("WScript.Shell")
' Get script directory
ScriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = ScriptDir

' Run start.bat relatively
WshShell.Run chr(34) & ScriptDir & "\start.bat" & chr(34), 0
Set WshShell = Nothing
