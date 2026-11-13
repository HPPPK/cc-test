#!/usr/bin/env python3
"""Fixture browser smoke: real desktop modules/WebSocket dispatch, fake backend/native delivery.
Run: python3 scripts/quality-gate/desktop-smoke/session-lifecycle.py
Uses an isolated browser and an ephemeral Vite port; never calls models or user APIs.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
base = f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='jiangxia-lifecycle-smoke-') as tmp:
    with open(Path(tmp) / 'vite.log', 'w') as log:
        server = subprocess.Popen(['bun', 'run', 'dev', '--host', '127.0.0.1', '--port', str(port)],
                                  cwd=ROOT / 'desktop', stdout=log, stderr=log,
                                  env={**os.environ, 'VITE_DESKTOP_SERVER_URL': base})
        try:
            for _ in range(100):
                try:
                    if urlopen(base, timeout=1).status == 200:
                        break
                except Exception:
                    time.sleep(0.1)
            else:
                raise RuntimeError('Vite did not become ready')
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True, channel='chrome')
                page = browser.new_page()
                page.route('**/__lifecycle_smoke', lambda route: route.fulfill(
                    content_type='text/html', body='<html><body>Background session fixture; no question or workflow components mounted.</body></html>'))
                page.route(base + '/api/**', lambda route: route.fulfill(json={
                    'messages': [], 'commands': [], 'tasks': [], 'sessions': [],
                }))
                sockets = {}
                outbound = []
                def handle_socket(ws):
                    sid = ws.url.rsplit('/', 1)[-1]
                    sockets[sid] = ws
                    ws.on_message(lambda message: outbound.append(json.loads(message)))
                page.route_web_socket('**/ws/**', handle_socket)
                page.goto(base + '/__lifecycle_smoke')
                page.wait_for_load_state('networkidle')
                page.evaluate("""async () => {
                    const { useChatStore } = await import('/src/stores/chatStore.ts')
                    const { useSessionStore } = await import('/src/stores/sessionStore.ts')
                    const { useSettingsStore } = await import('/src/stores/settingsStore.ts')
                    const { useTabStore } = await import('/src/stores/tabStore.ts')
                    const { setNativeNotificationSenderForTests } = await import('/src/lib/desktopNotifications.ts')
                    window.notices = []
                    window.chat = useChatStore
                    setNativeNotificationSenderForTests(options => { window.notices.push(options); return true })
                    useSettingsStore.setState({ desktopNotificationsEnabled: true })
                    useTabStore.setState({ activeTabId: '__settings__', tabs: [{ sessionId: '__settings__', title: 'Settings', type: 'settings', status: 'idle' }] })
                    useSessionStore.setState({ sessions: ['one', 'two'].map(id => ({ id, title: 'Session ' + id, messageCount: 1 })) })
                    for (const id of ['one', 'two']) useChatStore.getState().connectToSession(id, { prewarm: false })
                }""")
                page.wait_for_function("Object.keys(window.chat.getState().sessions).length === 2")
                for sid in ['one', 'two']:
                    sockets[sid].send(json.dumps({'type': 'connected', 'sessionId': sid}))
                    sockets[sid].send(json.dumps({'type': 'status', 'state': 'thinking'}))
                question = {'type': 'permission_request', 'requestId': 'q1', 'toolUseId': 't1',
                            'toolName': 'AskUserQuestion', 'input': {'questions': [{'question': 'Choose a target'}]}}
                sockets['one'].send(json.dumps(question))
                sockets['one'].send(json.dumps(question))
                page.wait_for_function('window.notices.length === 1')
                sockets['one'].send(json.dumps({'type': 'permission_response_ack', 'requestId': 'q1', 'status': 'accepted'}))
                for sid in ['one', 'two']:
                    sockets[sid].send(json.dumps({'type': 'message_complete', 'usage': {'input_tokens': 0, 'output_tokens': 0}}))
                    sockets[sid].send(json.dumps({'type': 'status', 'state': 'idle'}))
                page.wait_for_function('window.notices.length === 3')
                result = page.evaluate("""() => ({
                    titles: window.notices.map(n => n.title),
                    states: Object.values(window.chat.getState().sessions).map(s => s.lifecycle.status),
                    activeTab: document.body.textContent,
                })""")
                assert result['titles'] == ['Session one', 'Session one', 'Session two'], result
                assert result['states'] == ['ended', 'ended'], result
                assert not any(frame['type'] == 'prewarm_session' for frame in outbound), outbound
                print(json.dumps({'passed': True, 'checks': [
                    'background question without mounted components', 'request replay deduplication',
                    'empty completion from two sessions without cross-session suppression',
                    'session titles', 'idle/result deduplication', 'background listener does not prewarm CLI',
                ], **result}, ensure_ascii=False))
                browser.close()
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
