import { spawnSync } from "child_process";

const ADB_TIMEOUT = 30_000;
const SCREENSHOT_MAX_BUFFER = 50 * 1024 * 1024; // 50 MB

export interface AdbResult {
  stdout: string;
  stderr: string;
  success: boolean;
}

export interface ScreenshotResult {
  data: string | null; // base64-encoded PNG
  error: string;
}

export function runAdbCommand(args: string[]): AdbResult {
  const result = spawnSync("adb", args, {
    timeout: ADB_TIMEOUT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    success: result.status === 0 && !result.error,
  };
}

export function takeScreenshot(): ScreenshotResult {
  // encoding must be omitted (defaults to Buffer) so binary PNG is preserved
  const result = spawnSync("adb", ["exec-out", "screencap", "-p"], {
    timeout: ADB_TIMEOUT,
    maxBuffer: SCREENSHOT_MAX_BUFFER,
  });
  const buf = result.stdout as Buffer | null;
  if (result.status === 0 && buf && buf.length > 0) {
    return { data: buf.toString("base64"), error: "" };
  }
  const errBuf = result.stderr as Buffer | null;
  const errMsg =
    errBuf?.toString() || result.error?.message || "Screenshot failed";
  return { data: null, error: errMsg };
}

export function checkAdbConnected(): { connected: boolean; device: string } {
  const r = runAdbCommand(["devices"]);
  const lines = r.stdout
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("*"));
  const deviceLine = lines.find(
    (l) => l.includes("\tdevice") && !l.includes("offline")
  );
  return {
    connected: !!deviceLine,
    device: deviceLine?.split("\t")[0] ?? "",
  };
}

const KEY_CODES: Record<string, string> = {
  HOME: "KEYCODE_HOME",
  BACK: "KEYCODE_BACK",
  MENU: "KEYCODE_MENU",
  VOLUME_UP: "KEYCODE_VOLUME_UP",
  VOLUME_DOWN: "KEYCODE_VOLUME_DOWN",
  POWER: "KEYCODE_POWER",
  ENTER: "KEYCODE_ENTER",
  DELETE: "KEYCODE_DEL",
  SEARCH: "KEYCODE_SEARCH",
  RECENT_APPS: "KEYCODE_APP_SWITCH",
  NOTIFICATIONS: "KEYCODE_NOTIFICATION",
  BRIGHTNESS_UP: "KEYCODE_BRIGHTNESS_UP",
  BRIGHTNESS_DOWN: "KEYCODE_BRIGHTNESS_DOWN",
};

export function pressKey(key: string): AdbResult {
  const keycode = KEY_CODES[key.toUpperCase()] ?? key;
  return runAdbCommand(["shell", "input", "keyevent", keycode]);
}

export function tap(x: number, y: number): AdbResult {
  return runAdbCommand(["shell", "input", "tap", String(x), String(y)]);
}

export function swipe(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  durationMs = 300
): AdbResult {
  return runAdbCommand([
    "shell",
    "input",
    "swipe",
    String(x1),
    String(y1),
    String(x2),
    String(y2),
    String(durationMs),
  ]);
}

export function typeText(text: string): AdbResult {
  // ADB input text encodes spaces as %s; other special chars need escaping
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/ /g, "%s")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/&/g, "\\&")
    .replace(/</g, "\\<")
    .replace(/>/g, "\\>")
    .replace(/\|/g, "\\|")
    .replace(/;/g, "\\;");
  return runAdbCommand(["shell", "input", "text", escaped]);
}

export function listApps(includeSystem = false): AdbResult {
  const args = ["shell", "pm", "list", "packages"];
  if (!includeSystem) args.push("-3"); // third-party only
  return runAdbCommand(args);
}

export function launchApp(packageName: string): AdbResult {
  // Restrict to safe package name characters
  if (!/^[a-zA-Z0-9._]+$/.test(packageName)) {
    return { stdout: "", stderr: "Invalid package name", success: false };
  }
  return runAdbCommand([
    "shell",
    "monkey",
    "-p",
    packageName,
    "-c",
    "android.intent.category.LAUNCHER",
    "1",
  ]);
}

export function adbShell(command: string): AdbResult {
  // Runs command on Android device (not local machine)
  return runAdbCommand(["shell", command]);
}
