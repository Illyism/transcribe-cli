import { spawnSync } from 'child_process'
import { mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export function installMacQuickAction(): void {
  if (process.platform !== 'darwin') {
    console.error('Error: Finder Quick Actions are only supported on macOS.')
    process.exit(1)
  }

  const servicesDir = join(homedir(), 'Library', 'Services')
  const workflowDir = join(servicesDir, 'Transcribe Subtitles.workflow', 'Contents')

  try {
    mkdirSync(workflowDir, { recursive: true })

    const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>English</string>
	<key>CFBundleGetInfoString</key>
	<string>Transcribe Subtitles</string>
	<key>CFBundleIdentifier</key>
	<string>com.illyism.transcribe.quickaction</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>Transcribe Subtitles</string>
	<key>CFBundlePackageType</key>
	<string>BNDL</string>
	<key>CFBundleShortVersionString</key>
	<string>1.0</string>
	<key>CFBundleSignature</key>
	<string>????</string>
	<key>CFBundleVersion</key>
	<string>1.0</string>
	<key>NSServices</key>
	<array>
		<dict>
			<key>NSMenuItem</key>
			<dict>
				<key>default</key>
				<string>Transcribe Subtitles</string>
			</dict>
			<key>NSMessage</key>
			<string>runWorkflowAsService</string>
			<key>NSSendFileTypes</key>
			<array>
				<string>public.item</string>
			</array>
		</dict>
	</array>
</dict>
</plist>
`

    const documentWflow = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>AMApplicationBuild</key>
	<string>523</string>
	<key>AMApplicationVersion</key>
	<string>2.10</string>
	<key>AMDocumentVersion</key>
	<string>2</string>
	<key>actions</key>
	<array>
		<dict>
			<key>action</key>
			<dict>
				<key>AMAccepts</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Optional</key>
					<true/>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.path</string>
					</array>
				</dict>
				<key>AMActionVersion</key>
				<string>2.0.3</string>
				<key>AMApplication</key>
				<array>
					<string>Automator</string>
				</array>
				<key>AMParameterProperties</key>
				<dict>
					<key>COMMAND_STRING</key>
					<dict/>
					<key>CheckedForUserDefaultShell</key>
					<dict/>
					<key>inputMethod</key>
					<dict/>
					<key>shell</key>
					<dict/>
					<key>source</key>
					<dict/>
				</dict>
				<key>AMProvides</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.path</string>
					</array>
				</dict>
				<key>ActionBundlePath</key>
				<string>/System/Library/Automator/Run Shell Script.action</string>
				<key>ActionName</key>
				<string>Run Shell Script</string>
				<key>ActionParameters</key>
				<dict>
					<key>COMMAND_STRING</key>
					<string>
[ -f ~/.zprofile ] &amp;&amp; source ~/.zprofile
[ -f ~/.zshrc ] &amp;&amp; source ~/.zshrc
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

for f in "$@"; do
  file_name=$(basename "$f")
  osascript -e "display notification \\"Transcribing \${file_name}...\\" with title \\"Transcribe\\""
  if bunx @illyism/transcribe "$f" || npx @illyism/transcribe "$f"; then
    osascript -e "display notification \\"Saved subtitles for \${file_name}\\" with title \\"Transcribe Complete\\""
  else
    osascript -e "display notification \\"Failed to transcribe \${file_name}\\" with title \\"Transcribe Error\\""
  fi
done
</string>
					<key>CheckedForUserDefaultShell</key>
					<true/>
					<key>inputMethod</key>
					<integer>1</integer>
					<key>shell</key>
					<string>/bin/zsh</string>
					<key>source</key>
					<string></string>
				</dict>
				<key>BundleIdentifier</key>
				<string>com.apple.RunShellScript</string>
				<key>CFBundleVersion</key>
				<string>2.0.3</string>
				<key>CanShowSelectedItemsWhenRun</key>
				<false/>
				<key>CanShowWhenRun</key>
				<true/>
				<key>Category</key>
				<array>
					<string>AMCategoryUtilities</string>
				</array>
				<key>Class Name</key>
				<string>RunShellScriptAction</string>
				<key>InputUUID</key>
				<string>F68B6236-8E3B-441B-8E4B-1234567890AB</string>
				<key>Keywords</key>
				<array>
					<string>Shell</string>
					<string>Script</string>
					<string>Command</string>
					<string>Run</string>
					<string>Unix</string>
				</array>
				<key>OutputUUID</key>
				<string>A1234567-89AB-CDEF-0123-456789ABCDEF</string>
				<key>UUID</key>
				<string>B1234567-89AB-CDEF-0123-456789ABCDEF</string>
			</dict>
		</dict>
	</array>
	<key>connectors</key>
	<dict/>
	<key>workflowMetaData</key>
	<dict>
		<key>applicationBundleIDsByMainType</key>
		<dict/>
		<key>applicationPathsByMainType</key>
		<dict/>
		<key>inputTypeIdentifier</key>
		<string>com.apple.Automator.fileSystemObject</string>
		<key>outputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>presentationMode</key>
		<integer>15</integer>
		<key>processesInput</key>
		<false/>
		<key>serviceInputTypeIdentifier</key>
		<string>com.apple.Automator.fileSystemObject</string>
		<key>serviceOutputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>serviceProcessesInput</key>
		<false/>
		<key>systemImageName</key>
		<string>NSTouchBarRecordAudio</string>
		<key>useAutomaticInputType</key>
		<false/>
		<key>workflowTypeIdentifier</key>
		<string>com.apple.Automator.servicesMenu</string>
	</dict>
</dict>
</plist>
`

    writeFileSync(join(workflowDir, 'Info.plist'), infoPlist, 'utf-8')
    writeFileSync(join(workflowDir, 'document.wflow'), documentWflow, 'utf-8')

    // Refresh LaunchServices so Finder displays the Quick Action immediately
    spawnSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', [
      '-R',
      join(servicesDir, 'Transcribe Subtitles.workflow'),
    ])

    console.log('✅ Installed macOS Finder Quick Action!')
    console.log('\nHow to use:')
    console.log('  1. Open Finder')
    console.log('  2. Right-click any video or audio file')
    console.log('  3. Select "Quick Actions" → "Transcribe Subtitles"')
    console.log('\nSubtitles will be generated in the background with a Mac system notification when complete.')
  } catch (err) {
    console.error('Error installing macOS Quick Action:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
