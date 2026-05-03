import { App, TFile, TFolder, normalizePath } from "obsidian";
import { PlaybackMode, PluginSettings } from "../types";

export const DEFAULT_SETTINGS: PluginSettings = {
	musicFolderPath: "",
	favorites: [],
	playbackMode: "loop" as PlaybackMode,
	metadata: {},
	showControlButtons: true,
	closeHubOnClickOutside: false,
	volume: 1,
	enableCustomLyricsColor: false,
	lyricsHighlightColorDark: "",
	lyricsHighlightColorLight: "",
	showLoadNotice: true,
	lastPlayedTrackPath: "",
};

/**
 * 格式化时间显示 (秒 -> MM:SS)
 */
export function formatTime(seconds: number): string {
	if (!isFinite(seconds) || isNaN(seconds)) {
		return "--:--";
	}
	return new Date(seconds * 1000).toISOString().slice(14, 19);
}

/**
 * 检查文件是否为支持的音频格式
 */
export function isSupportedAudioFile(filename: string): boolean {
	const ext = filename.split(".").pop()?.toLowerCase();
	return ["flac", "mp3", "wav", "m4a", "ogg"].includes(ext || "");
}

/**
 * 仅读取音乐文件夹内直接包含的音频文件，不递归子文件夹
 */
export function collectSupportedAudioFilesFromFolder(
	app: App,
	folderPath: string
): TFile[] {
	const normalizedPath = normalizePath(folderPath);
	const root = app.vault.getAbstractFileByPath(normalizedPath);

	if (!root) {
		return [];
	}

	if (root instanceof TFile) {
		return isSupportedAudioFile(root.name) ? [root] : [];
	}

	if (!(root instanceof TFolder)) {
		return [];
	}

	// 仅扫描直接子文件，不递归进入子文件夹
	const collectedFiles: TFile[] = [];
	for (const child of root.children) {
		if (child instanceof TFile && isSupportedAudioFile(child.name)) {
			collectedFiles.push(child);
		}
	}

	return collectedFiles;
}

/**
 * 限制数值在指定范围内
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => void>(
	func: T,
	wait: number
): (...args: Parameters<T>) => void {
	let timeout: NodeJS.Timeout | null = null;

	return (...args: Parameters<T>) => {
		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(() => func(...args), wait);
	};
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: any[]) => void>(
	func: T,
	limit: number
): (...args: Parameters<T>) => void {
	let inThrottle: boolean = false;

	return (...args: Parameters<T>) => {
		if (!inThrottle) {
			func(...args);
			inThrottle = true;
			setTimeout(() => (inThrottle = false), limit);
		}
	};
}
