import * as mm from "music-metadata";
import { TrackMetadata } from "../types";
import { DEFAULT_METADATA } from "../utils/constants";

export class MetadataParser {
	private blobUrls = new Map<string, Blob>();

	/**
	 * 从音频文件中提取元数据
	 */
	async extractMetadata(arrayBuffer: ArrayBuffer): Promise<TrackMetadata> {
		try {
			// 使用 music-metadata 库提取元数据
			const metadata = await mm.parseBuffer(Buffer.from(arrayBuffer));

			return {
				title: metadata.common.title || "未知标题",
				artist: metadata.common.artist || "未知艺术家",
				album: metadata.common.album || "未知专辑",
				cover: await this.extractCover(metadata.common.picture),
				lyrics: this.extractLyrics(metadata),
			};
		} catch (error) {
			console.error("Failed to extract metadata:", error);
			return { ...DEFAULT_METADATA };
		}
	}

	/**
	 * 提取封面图片
	 */
	private async extractCover(
		pictures: mm.IPicture[] | undefined
	): Promise<string | null> {
		if (!pictures || pictures.length === 0) {
			return null;
		}

		try {
			// 使用第一张图片（通常是封面）
			const picture = pictures[0];

			// 创建一个新的 Uint8Array 来避免类型问题
			const uint8Array = new Uint8Array(picture.data);
			const blob = new Blob([uint8Array], { type: picture.format });
			const blobUrl = URL.createObjectURL(blob);

			// 存储引用以便清理
			this.blobUrls.set(blobUrl, blob);

			return blobUrl;
		} catch (error) {
			console.warn("Failed to extract cover:", error);
			return null;
		}
	}

	/**
	 * 从元数据中提取歌词
	 * 支持多种音频格式的歌词标签
	 */
	private extractLyrics(metadata: mm.IAudioMetadata): string | null {
		try {
			// 1. 首先尝试从 common.lyrics 获取（music-metadata 标准化后的字段）
			if (metadata.common.lyrics && Array.isArray(metadata.common.lyrics)) {
				for (const lyric of metadata.common.lyrics) {
					const lyricAny = lyric as any;
					if (lyricAny && typeof lyricAny === 'string' && lyricAny.trim()) {
						return lyricAny.trim();
					}
					if (lyricAny && typeof lyricAny === 'object' && 'text' in lyricAny) {
						const text = lyricAny.text;
						if (text && typeof text === 'string' && text.trim()) {
							return text.trim();
						}
					}
				}
			}

			// 2. 尝试从 ID3v2 标签获取 (MP3 格式)
			if (metadata.native?.id3v2) {
				// USLT: Unsynchronised lyrics/text transcription
				const usltTag = metadata.native.id3v2.find(
					(tag: any) => tag.id === "USLT"
				);
				if (usltTag?.value) {
					const lyricsText = this.extractLyricsText(usltTag.value);
					if (lyricsText) return lyricsText;
				}

				// SYLT: Synchronised lyrics/text (LRC格式)
				const syltTag = metadata.native.id3v2.find(
					(tag: any) => tag.id === "SYLT"
				);
				if (syltTag?.value) {
					const lyricsText = this.extractLyricsText(syltTag.value);
					if (lyricsText) return lyricsText;
				}

				// TXXX: User defined text information (有些软件将歌词存在这里)
				const txxxTag = metadata.native.id3v2.find(
					(tag: any) =>
						tag.id === "TXXX" &&
						tag.value?.description?.toLowerCase().includes("lyric")
				);
				if (txxxTag?.value) {
					const txxxValue = txxxTag.value as any;
					if (txxxValue.text) {
						const lyricsText = this.extractLyricsText(txxxValue.text);
						if (lyricsText) return lyricsText;
					}
				}
			}

			// 3. 尝试从 Vorbis Comment 获取 (OGG, FLAC, OPUS 格式)
			if (metadata.native?.vorbis) {
				const lyricsTag = metadata.native.vorbis.find(
					(tag: any) =>
						tag.id === "LYRICS" ||
						tag.id === "UNSYNCEDLYRICS" ||
						tag.id === "lyrics" ||
						tag.id === "UNSYNCED LYRICS"
				);
				if (lyricsTag?.value) {
					const lyricsText = this.extractLyricsText(lyricsTag.value);
					if (lyricsText) return lyricsText;
				}
			}

			// 4. 尝试从 APEv2 获取 (APE, MPC 格式)
			if (metadata.native?.apev2) {
				const lyricsTag = metadata.native.apev2.find(
					(tag: any) =>
						tag.id === "Lyrics" ||
						tag.id === "LYRICS" ||
						tag.id === "UNSYNCED LYRICS"
				);
				if (lyricsTag?.value) {
					const lyricsText = this.extractLyricsText(lyricsTag.value);
					if (lyricsText) return lyricsText;
				}
			}

			// 5. 尝试从 iTunes/MP4 标签获取 (M4A, MP4 格式)
			if (metadata.native?.["iTunes"] || metadata.native?.["mp4"]) {
				const itunesNative = metadata.native["iTunes"] || metadata.native["mp4"];
				const lyricsTag = itunesNative?.find(
					(tag: any) =>
						tag.id === "©lyr" || // iTunes lyrics tag
						tag.id === "----:com.apple.iTunes:LYRICS"
				);
				if (lyricsTag?.value) {
					const lyricsText = this.extractLyricsText(lyricsTag.value);
					if (lyricsText) return lyricsText;
				}
			}

			// 6. 尝试从 ASF/WMA 标签获取 (WMA 格式)
			if (metadata.native?.asf) {
				const lyricsTag = metadata.native.asf.find(
					(tag: any) =>
						tag.id === "WM/Lyrics" ||
						tag.id === "WM/Lyrics_Synchronised"
				);
				if (lyricsTag?.value) {
					const lyricsText = this.extractLyricsText(lyricsTag.value);
					if (lyricsText) return lyricsText;
				}
			}

			return null;
		} catch (error) {
			console.warn("Failed to extract lyrics from metadata:", error);
			return null;
		}
	}

	/**
	 * 从各种格式的歌词数据中提取文本
	 */
	private extractLyricsText(value: any): string | null {
		if (!value) return null;

		// 如果是字符串，直接返回
		if (typeof value === "string") {
			const trimmed = value.trim();
			return trimmed ? trimmed : null;
		}

		// 如果是数组，尝试从第一个元素获取
		if (Array.isArray(value)) {
			for (const item of value) {
				const text = this.extractLyricsText(item);
				if (text) return text;
			}
			return null;
		}

		// 如果是对象，尝试获取 text 字段
		if (typeof value === "object") {
			// USLT 格式: { language: 'xxx', description: 'xxx', text: 'lyrics...' }
			if ("text" in value && value.text) {
				const text = this.extractLyricsText(value.text);
				if (text) return text;
			}

			// 某些格式可能直接是对象的字符串表示
			if ("descriptor" in value && value.descriptor) {
				return this.extractLyricsText(value.descriptor);
			}

			// SYLT 格式: 同步歌词，包含时间戳
			if ("lyrics" in value && Array.isArray(value.lyrics)) {
				// 提取所有歌词行，忽略时间戳
				const lines = value.lyrics
					.map((line: any) => {
						if (typeof line === "string") return line;
						if (line && typeof line === "object" && "text" in line) {
							return line.text;
						}
						return null;
					})
					.filter((line: string | null) => line !== null);

				return lines.length > 0 ? lines.join("\n") : null;
			}
		}

		return null;
	}

	/**
	 * 清理Blob URLs
	 */
	cleanup(): void {
		this.blobUrls.forEach((blob, url) => {
			URL.revokeObjectURL(url);
		});
		this.blobUrls.clear();
	}
}
