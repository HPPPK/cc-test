use std::collections::HashMap;

pub fn apply_system_proxy(env: &mut HashMap<String, String>, registry: &str) {
    let mut bypass = Vec::new();
    for key in ["no_proxy", "NO_PROXY"] {
        if let Some(value) = env.get(key) {
            bypass.extend(
                value
                    .split(',')
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_owned),
            );
        }
    }
    bypass.extend(["localhost", "127.0.0.1", "::1"].map(str::to_owned));
    bypass.sort();
    bypass.dedup();
    let bypass = bypass.join(",");
    env.insert("NO_PROXY".into(), bypass.clone());
    env.insert("no_proxy".into(), bypass);
    if [
        "http_proxy",
        "https_proxy",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "all_proxy",
        "ALL_PROXY",
    ]
    .iter()
    .any(|key| env.get(*key).is_some_and(|value| !value.trim().is_empty()))
    {
        return;
    }
    let value = |name: &str| {
        registry.lines().find_map(|line| {
            let fields: Vec<_> = line.split_whitespace().collect();
            (fields.len() == 3 && fields[0].eq_ignore_ascii_case(name)).then(|| fields[2])
        })
    };
    if value("ProxyEnable") != Some("0x1") {
        return;
    }
    let Some(server) = value("ProxyServer") else {
        return;
    };
    for (protocol, key) in [("http", "HTTP_PROXY"), ("https", "HTTPS_PROXY")] {
        let endpoint = if server.contains('=') {
            server.split(';').find_map(|item| {
                item.split_once('=')
                    .filter(|(scheme, _)| *scheme == protocol)
                    .map(|(_, host)| host)
            })
        } else {
            Some(server)
        };
        if let Some(endpoint) = endpoint.filter(|host| !host.is_empty()) {
            let url = if endpoint.starts_with("http://") || endpoint.starts_with("https://") {
                endpoint.to_owned()
            } else if !endpoint.contains("://") {
                format!("http://{endpoint}")
            } else {
                continue;
            };
            env.insert(key.into(), url);
        }
    }
}

/// Read-only static Windows proxy discovery. Never changes OS settings or logs credentials.
#[cfg(target_os = "windows")]
pub fn read_system_proxy() -> String {
    use std::os::windows::process::CommandExt;
    let Some(root) = std::env::var_os("SystemRoot") else {
        return String::new();
    };
    let executable = std::path::PathBuf::from(root)
        .join("System32")
        .join("reg.exe");
    std::process::Command::new(executable)
        .args([
            "query",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings",
        ])
        .creation_flags(0x08000000)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).into_owned())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    const SYSTEM: &str =
        "ProxyEnable    REG_DWORD    0x1\nProxyServer    REG_SZ    127.0.0.1:7897\n";

    #[test]
    fn imports_enabled_proxy_and_bypasses_loopback() {
        let mut env = HashMap::new();
        apply_system_proxy(&mut env, SYSTEM);
        assert_eq!(
            env.get("HTTPS_PROXY").map(String::as_str),
            Some("http://127.0.0.1:7897")
        );
        assert_eq!(env.get("HTTP_PROXY"), env.get("HTTPS_PROXY"));
        for host in ["localhost", "127.0.0.1", "::1"] {
            assert!(env["NO_PROXY"].split(',').any(|item| item == host));
        }
    }

    #[test]
    fn explicit_configuration_wins_and_bypass_is_preserved() {
        let mut env = HashMap::from([
            ("https_proxy".into(), "http://explicit:8080".into()),
            ("no_proxy".into(), "example.com".into()),
        ]);
        apply_system_proxy(&mut env, SYSTEM);
        assert!(!env.contains_key("HTTPS_PROXY"));
        assert_eq!(env["https_proxy"], "http://explicit:8080");
        assert!(env["no_proxy"].contains("example.com"));
        assert!(env["no_proxy"].contains("localhost"));
    }

    #[test]
    fn disabled_missing_and_pac_only_configs_do_not_enable_proxy() {
        for config in [
            "",
            "ProxyEnable REG_DWORD 0x0\nProxyServer REG_SZ host:80",
            "ProxyEnable REG_DWORD 0x1\nAutoConfigURL REG_SZ https://example.com/proxy.pac",
        ] {
            let mut env = HashMap::new();
            apply_system_proxy(&mut env, config);
            assert!(!env.contains_key("HTTPS_PROXY"));
        }
    }

    #[test]
    fn supports_protocol_specific_proxy_servers() {
        let mut env = HashMap::new();
        apply_system_proxy(&mut env, "ProxyEnable REG_DWORD 0x1\nProxyServer REG_SZ http=localhost:8080;https=localhost:8081;socks=localhost:1080");
        assert_eq!(env["HTTP_PROXY"], "http://localhost:8080");
        assert_eq!(env["HTTPS_PROXY"], "http://localhost:8081");
    }
}
