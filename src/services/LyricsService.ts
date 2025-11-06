import { App, TFile } from "obsidian";
import { LyricLine, LyricsEvents, MusicTrack, ParsedLyrics } from "../types";
import { normalizePath } from "../utils/helpers";

export class LyricsService {
	private app: App;
	private events: Partial<LyricsEvents> = {};
	private currentLyrics: ParsedLyrics | null = null;
	private currentLineIndex: number = -1;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 注册事件监听器
	 */
	on<K extends keyof LyricsEvents>(
		event: K,
		callback: LyricsEvents[K]
	): void {
		this.events[event] = callback;
	}

	/**
	 * 触发事件
	 */
	private emit<K extends keyof LyricsEvents>(
		event: K,
		...args: Parameters<LyricsEvents[K]>
	): void {
		const callback = this.events[event];
		if (callback) {
			(callback as any)(...args);
		}
	}

	/**
	 * 为指定音乐文件加载歌词
	 */
	async loadLyricsForTrack(track: MusicTrack): Promise<ParsedLyrics | null> {
		if (!track) {
			this.currentLyrics = null;
			this.emit("onLyricsLoaded", null);
			return null;
		}

		try {
			// 首先尝试从元数据获取歌词
			let lyrics = await this.getLyricsFromMetadata(track);

			// 如果元数据中没有歌词，尝试从同名 LRC 文件获取
			if (!lyrics) {
				lyrics = await this.getLyricsFromLrcFile(track);
			}

			this.currentLyrics = lyrics;
			this.currentLineIndex = -1;
			this.emit("onLyricsLoaded", lyrics);

			return lyrics;
		} catch (error) {
			console.error(
				"Failed to load lyrics for track:",
				track.name,
				error
			);
			this.currentLyrics = null;
			this.emit("onLyricsLoaded", null);
			return null;
		}
	}

	/**
	 * 从音乐文件元数据中获取歌词
	 */
	private async getLyricsFromMetadata(
		track: MusicTrack
	): Promise<ParsedLyrics | null> {
		if (!track.metadata.lyrics) {
			return null;
		}

		try {
			return this.parseLyrics(track.metadata.lyrics);
		} catch (error) {
			console.warn("Failed to parse lyrics from metadata:", error);
			return null;
		}
	}

	/**
	 * 从同名 LRC 文件获取歌词
	 */
	private async getLyricsFromLrcFile(
		track: MusicTrack
	): Promise<ParsedLyrics | null> {
		try {
			// 构造 LRC 文件路径
			const trackPath = normalizePath(track.path);
			const lrcPath = trackPath.replace(/\.[^.]+$/, ".lrc");

			// 检查 LRC 文件是否存在
			const lrcFile = this.app.vault.getAbstractFileByPath(lrcPath);
			if (!(lrcFile instanceof TFile)) {
				return null;
			}

			// 读取 LRC 文件内容
			const lrcContent = await this.app.vault.read(lrcFile);
			return this.parseLyrics(lrcContent);
		} catch (error) {
			console.warn(
				"Failed to load LRC file for track:",
				track.name,
				error
			);
			return null;
		}
	}

	/**
	 * 解析歌词内容（支持 LRC 格式）
	 */
	private parseLyrics(lyricsText: string): ParsedLyrics | null {
		if (!lyricsText || lyricsText.trim() === "") {
			return null;
		}

		const lines: LyricLine[] = [];
		const metaData: {
			title?: string;
			artist?: string;
			album?: string;
			offset?: number;
		} = {};

		// 按行分割歌词
		const textLines = lyricsText.split("\n");

		for (const line of textLines) {
			const trimmedLine = line.trim();
			if (!trimmedLine) continue;

			// 解析元数据标签
			const metaMatch = trimmedLine.match(/^\[(\w+):(.+)\]$/);
			if (metaMatch) {
				const [, key, value] = metaMatch;
				switch (key.toLowerCase()) {
					case "ti":
						metaData.title = value.trim();
						break;
					case "ar":
						metaData.artist = value.trim();
						break;
					case "al":
						metaData.album = value.trim();
						break;
					case "offset":
						metaData.offset = parseInt(value.trim(), 10);
						break;
				}
				continue;
			}

			// 解析时间标签和歌词
			const timeMatches = trimmedLine.match(
				/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/
			);
			if (timeMatches) {
				const [, minutes, seconds, milliseconds, text] = timeMatches;
				const time =
					parseInt(minutes, 10) * 60 +
					parseInt(seconds, 10) +
					parseInt(milliseconds.padEnd(3, "0"), 10) / 1000;

				lines.push({
					time,
					text: text.trim(),
				});
			} else {
				// 没有时间标签的歌词行，添加到最后一行或创建新行
				if (lines.length > 0) {
					const lastLine = lines[lines.length - 1];
					lastLine.text += "\n" + trimmedLine;
				} else {
					lines.push({
						time: 0,
						text: trimmedLine,
					});
				}
			}
		}

		// 按时间排序
		lines.sort((a, b) => a.time - b.time);

		if (lines.length === 0) {
			return null;
		}

		return {
			lines,
			...metaData,
		};
	}

	/**
	 * 根据当前播放时间更新当前歌词行
	 */
	updateCurrentTime(currentTime: number): void {
		if (!this.currentLyrics || this.currentLyrics.lines.length === 0) {
			return;
		}

		// 考虑偏移量
		const adjustedTime =
			currentTime + (this.currentLyrics.offset || 0) / 1000;

		// 查找当前时间对应的歌词行
		let newLineIndex = -1;
		for (let i = this.currentLyrics.lines.length - 1; i >= 0; i--) {
			if (adjustedTime >= this.currentLyrics.lines[i].time) {
				newLineIndex = i;
				break;
			}
		}

		// 如果当前行发生变化，触发事件
		if (newLineIndex !== this.currentLineIndex) {
			this.currentLineIndex = newLineIndex;
			this.emit("onCurrentLineChange", newLineIndex);
		}
	}

	/**
	 * 获取当前歌词
	 */
	getCurrentLyrics(): ParsedLyrics | null {
		return this.currentLyrics;
	}

	/**
	 * 获取当前行索引
	 */
	getCurrentLineIndex(): number {
		return this.currentLineIndex;
	}

	/**
	 * 获取当前行的歌词文本
	 */
	getCurrentLineText(): string {
		if (
			!this.currentLyrics ||
			this.currentLineIndex < 0 ||
			this.currentLineIndex >= this.currentLyrics.lines.length
		) {
			return "";
		}

		return this.currentLyrics.lines[this.currentLineIndex].text;
	}

	/**
	 * 清理资源
	 */
	cleanup(): void {
		this.currentLyrics = null;
		this.currentLineIndex = -1;
		this.events = {};
	}
}
