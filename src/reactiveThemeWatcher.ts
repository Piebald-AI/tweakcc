// tw.js source — written to ~/.tweakcc/tw.js at patch-apply time.
// Called at runtime by the patched ThemeProvider useEffect:
//   require("~/.tweakcc/tw.js")(setState, querier, darkId, lightId)
//
// Must return a cleanup function (called on useEffect unmount).

export const REACTIVE_THEME_WATCHER_JS = `'use strict';

var _cp = require('child_process');
var _fs = require('fs');
var _path = require('path');
var _os = require('os');

var HOME = _os.homedir();

function themeName(isDark, darkId, lightId) {
  return isDark ? darkId : lightId;
}

// macOS -----------------------------------------------------------------------

function macOSDetect() {
  try {
    _cp.execSync('defaults read -g AppleInterfaceStyle', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function watchDarwin(setState, darkId, lightId) {
  // Check if a Swift watcher daemon is running (writes ~/.claude/.current-theme)
  var swiftFile = _path.join(HOME, '.claude', '.current-theme');
  try {
    var content = _fs.readFileSync(swiftFile, 'utf8').trim();
    if (content) {
      setState(content);
      var w = _fs.watch(swiftFile, function() {
        try {
          var t = _fs.readFileSync(swiftFile, 'utf8').trim();
          if (t) setState(t);
        } catch {}
      });
      return function() { w.close(); };
    }
  } catch {}

  // Plist watch fallback
  setState(themeName(macOSDetect(), darkId, lightId));
  var plist = _path.join(HOME, 'Library', 'Preferences', '.GlobalPreferences.plist');
  var prev = macOSDetect();
  var debounce = null;

  var watcher = _fs.watch(plist, function() {
    if (debounce) return;
    debounce = setTimeout(function() {
      debounce = null;
      var isDark = macOSDetect();
      if (isDark !== prev) {
        prev = isDark;
        setState(themeName(isDark, darkId, lightId));
      }
    }, 100);
  });

  return function() {
    if (debounce) clearTimeout(debounce);
    watcher.close();
  };
}

// Linux -----------------------------------------------------------------------

function linuxDetect() {
  try {
    var out = _cp.execSync(
      'gdbus call --session --dest org.freedesktop.portal.Desktop ' +
      '--object-path /org/freedesktop/portal/desktop ' +
      '--method org.freedesktop.portal.Settings.Read ' +
      'org.freedesktop.appearance color-scheme',
      { stdio: 'pipe', timeout: 3000 }
    ).toString();
    var m = out.match(/uint32\\s+(\\d)/);
    return m ? m[1] === '1' : false;
  } catch {
    return false;
  }
}

function watchLinux(setState, darkId, lightId) {
  try {
    setState(themeName(linuxDetect(), darkId, lightId));
  } catch {
    setState(darkId);
    return function() {};
  }

  var proc = _cp.spawn('gdbus', [
    'monitor', '--session',
    '--dest', 'org.freedesktop.portal.Desktop',
    '--object-path', '/org/freedesktop/portal/desktop'
  ], { stdio: ['ignore', 'pipe', 'ignore'] });

  var buf = '';
  proc.stdout.on('data', function(data) {
    buf += data.toString();
    var lines = buf.split('\\n');
    buf = lines.pop() || '';
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(
        /SettingChanged\\s*\\(\\s*'org\\.freedesktop\\.appearance',\\s*'color-scheme',\\s*<uint32\\s+(\\d)>/
      );
      if (m) {
        setState(themeName(m[1] === '1', darkId, lightId));
      }
    }
  });

  proc.on('error', function() {});
  return function() { proc.kill(); };
}

// Windows ---------------------------------------------------------------------

function windowsDetect() {
  try {
    var out = _cp.execSync(
      'reg query "HKCU\\\\SOFTWARE\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Themes\\\\Personalize" /v AppsUseLightTheme',
      { stdio: 'pipe', timeout: 3000 }
    ).toString();
    return out.includes('0x0');
  } catch {
    return false;
  }
}

function watchWindows(setState, darkId, lightId, configDir) {
  setState(themeName(windowsDetect(), darkId, lightId));

  var psScript = _path.join(configDir, 'theme-watcher.ps1');
  try {
    _fs.writeFileSync(psScript, [
      'Add-Type @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public class RegMon {',
      '    [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]',
      '    public static extern int RegOpenKeyEx(IntPtr hKey, string subKey, int options, int sam, out IntPtr result);',
      '    [DllImport("advapi32.dll", SetLastError=true)]',
      '    public static extern int RegNotifyChangeKeyValue(IntPtr hKey, bool watchSubtree, int filter, IntPtr hEvent, bool async);',
      '    [DllImport("advapi32.dll", SetLastError=true)]',
      '    public static extern int RegCloseKey(IntPtr hKey);',
      '    public static readonly IntPtr HKCU = new IntPtr(unchecked((int)0x80000001));',
      '}',
      '"@',
      '$subKey = "SOFTWARE\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Themes\\\\Personalize"',
      '$prev = ""',
      'while ($true) {',
      '    $hKey = [IntPtr]::Zero',
      '    $r = [RegMon]::RegOpenKeyEx([RegMon]::HKCU, $subKey, 0, 0x20019 -bor 0x0010, [ref]$hKey)',
      '    if ($r -ne 0) { Start-Sleep -Seconds 5; continue }',
      '    [RegMon]::RegNotifyChangeKeyValue($hKey, $false, 4, [IntPtr]::Zero, $false) | Out-Null',
      '    [RegMon]::RegCloseKey($hKey) | Out-Null',
      '    $v = (Get-ItemPropertyValue "HKCU:\\\\$subKey" -Name AppsUseLightTheme -ErrorAction SilentlyContinue)',
      '    $t = if ($v -eq 0) { "dark" } else { "light" }',
      '    if ($t -ne $prev) { $prev = $t; Write-Output "theme:$t"; [Console]::Out.Flush() }',
      '}'
    ].join('\\n'));
  } catch {
    return function() {};
  }

  var proc = _cp.spawn('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScript
  ], { stdio: ['ignore', 'pipe', 'ignore'] });

  var buf = '';
  proc.stdout.on('data', function(data) {
    buf += data.toString();
    var lines = buf.split('\\n');
    buf = lines.pop() || '';
    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      if (trimmed === 'theme:dark') setState(themeName(true, darkId, lightId));
      else if (trimmed === 'theme:light') setState(themeName(false, darkId, lightId));
    }
  });

  proc.on('error', function() {});
  return function() { proc.kill(); };
}

// OSC 11 via internal querier -------------------------------------------------

var OSC_BG_QUERY = {
  request: '\\x1b]11;?\\x07',
  match: function(r) { return r.type === 'osc' && r.code === 11; }
};

function parseOscLuminance(data) {
  var r, g, b;
  var rgbMatch = data.match(/^rgba?:([0-9a-f]{1,4})\\/([0-9a-f]{1,4})\\/([0-9a-f]{1,4})/i);
  if (rgbMatch) {
    var norm = function(hex) { return parseInt(hex, 16) / (Math.pow(16, hex.length) - 1); };
    r = norm(rgbMatch[1]); g = norm(rgbMatch[2]); b = norm(rgbMatch[3]);
  } else {
    var hexMatch = data.match(/^#([0-9a-f]+)$/i);
    if (!hexMatch) return undefined;
    var h = hexMatch[1];
    var len = h.length / 3;
    var norm2 = function(s) { return parseInt(s, 16) / (Math.pow(16, s.length) - 1); };
    r = norm2(h.slice(0, len)); g = norm2(h.slice(len, len*2)); b = norm2(h.slice(len*2));
  }
  var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.5 ? 'light' : 'dark';
}

function watchQuerier(setState, querier, darkId, lightId) {
  var prev = null;
  var timer = null;

  function poll() {
    Promise.race([
      querier.send(OSC_BG_QUERY).then(function(r) {
        return querier.flush().then(function() { return r; });
      }),
      new Promise(function(_, reject) {
        setTimeout(function() { reject('timeout'); }, 3000);
      })
    ]).then(function(resp) {
      if (resp && resp.data) {
        var mode = parseOscLuminance(resp.data);
        if (mode) {
          var theme = themeName(mode === 'dark', darkId, lightId);
          if (theme !== prev) { prev = theme; setState(theme); }
        }
      }
    }).catch(function() {});
  }

  poll();
  timer = setInterval(poll, 500);
  return function() { clearInterval(timer); };
}

// Entry point -----------------------------------------------------------------

module.exports = function(setState, querier, darkId, lightId, configDir) {
  darkId = darkId || 'dark';
  lightId = lightId || 'light';
  configDir = configDir || _path.join(HOME, '.tweakcc');
  var platform = process.platform;
  if (platform === 'darwin') return watchDarwin(setState, darkId, lightId);
  if (platform === 'linux') return watchLinux(setState, darkId, lightId);
  if (platform === 'win32') return watchWindows(setState, darkId, lightId, configDir);
  if (querier) return watchQuerier(setState, querier, darkId, lightId);
  setState(darkId);
  return function() {};
};
`;
