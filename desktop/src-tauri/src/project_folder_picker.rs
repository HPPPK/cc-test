use std::process::{Command, Output};

// A fixed script with a separate argv title, never interpolated source.
// Isolating AppKit in the OS helper also contains process exits, not just panics.
const PICK_FOLDER_SCRIPT: &str = r#"on run argv
    activate
    try
        set selectedFolder to choose folder with prompt (item 1 of argv)
        return POSIX path of selectedFolder
    on error number -128
        return ""
    end try
end run"#;

fn decode_output(output: Output) -> Result<Option<String>, String> {
    if !output.status.success() {
        return Err(format!("Folder picker helper failed: {}", output.status));
    }
    let text = String::from_utf8(output.stdout)
        .map_err(|_| "Folder picker returned invalid UTF-8".to_string())?;
    // osascript adds one newline. Do not trim valid whitespace from a path.
    let path = text.strip_suffix('\n').unwrap_or(&text);
    if path.is_empty() {
        return Ok(None);
    }
    let directory = std::path::Path::new(path);
    if !directory.is_absolute() || !directory.is_dir() {
        return Err("Folder picker did not return an existing absolute directory".to_string());
    }
    Ok(Some(path.to_string()))
}

fn run_picker(
    title: &str,
    run: impl FnOnce(&mut Command) -> std::io::Result<Output>,
) -> Result<Option<String>, String> {
    let mut command = Command::new("/usr/bin/osascript");
    command.args(["-e", PICK_FOLDER_SCRIPT, title]);
    let output =
        run(&mut command).map_err(|error| format!("Cannot start folder picker: {error}"))?;
    decode_output(output)
}

#[cfg(target_os = "macos")]
pub fn pick(title: &str) -> Result<Option<String>, String> {
    static ACTIVE_PICKER: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = ACTIVE_PICKER
        .try_lock()
        .map_err(|_| "A folder picker is already open".to_string())?;
    run_picker(title, |command| command.output())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::process::ExitStatusExt;
    use std::process::{ExitStatus, Output};

    fn output(code: i32, stdout: &[u8]) -> Output {
        Output {
            status: ExitStatus::from_raw(code << 8),
            stdout: stdout.to_vec(),
            stderr: vec![],
        }
    }

    #[test]
    fn helper_failure_and_crash_are_recoverable_errors() {
        assert!(decode_output(output(101, b"")).is_err());
        assert!(decode_output(Output {
            status: ExitStatus::from_raw(9),
            stdout: vec![],
            stderr: vec![]
        })
        .is_err());
    }

    #[test]
    fn a_real_child_exit_does_not_exit_the_parent() {
        let result = run_picker("Choose", |_| {
            Command::new("/bin/sh").args(["-c", "exit 101"]).output()
        });
        assert!(result.unwrap_err().contains("101"));
    }

    #[test]
    fn cancellation_is_distinct_from_invalid_output() {
        assert_eq!(decode_output(output(0, b"\n")).unwrap(), None);
        assert!(decode_output(output(0, b"relative/path\n")).is_err());
        assert!(decode_output(output(0, b"/does-not-exist-jiangxia-picker\n")).is_err());
        assert!(decode_output(output(0, &[0xff, b'\n'])).is_err());
    }

    #[test]
    fn selected_directory_keeps_unicode_and_spaces() {
        let path =
            std::env::temp_dir().join(format!("jiangxia-选择 folder-{} ", std::process::id()));
        std::fs::create_dir_all(&path).unwrap();
        let selected = format!("{}\n", path.display());
        assert_eq!(
            decode_output(output(0, selected.as_bytes())).unwrap(),
            Some(path.to_string_lossy().into_owned())
        );
        std::fs::remove_dir(path).unwrap();
    }

    #[test]
    fn title_is_an_argument_and_spawn_failure_is_recoverable() {
        let title = "选择目录 \" & do shell script \"bad";
        let result = run_picker(title, |command| {
            assert_eq!(command.get_program(), "/usr/bin/osascript");
            let args: Vec<_> = command.get_args().collect();
            assert_eq!(args[0], "-e");
            assert!(!args[1].to_string_lossy().contains(title));
            assert!(args[1].to_string_lossy().contains("activate"));
            assert_eq!(args[2], title);
            Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "missing helper",
            ))
        });
        assert!(result.is_err());
    }
}
