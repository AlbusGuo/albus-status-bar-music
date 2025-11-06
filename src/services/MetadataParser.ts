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
	 */
	private extractLyrics(metadata: mm.IAudioMetadata): string | null {
		try {
			// 尝试从不同的歌词字段获取歌词
			const lyrics =
				metadata.common.lyrics ||
				metadata.native?.id3v2?.find((tag: any) => tag.id === "USLT")
					?.value ||
				metadata.native?.id3v1?.find((tag: any) => tag.id === "USLT")
					?.value ||
				metadata.native?.vorbis?.find((tag: any) => tag.id === "LYRICS")
					?.value ||
				metadata.native?.apev2?.find((tag: any) => tag.id === "LYRICS")
					?.value;

			if (lyrics) {
				// 如果是数组，取第一个元素
				if (Array.isArray(lyrics)) {
					return lyrics[0]?.text || lyrics[0] || null;
				}

				// 如果是对象，尝试获取文本内容
				if (typeof lyrics === "object" && (lyrics as any).text) {
					return (lyrics as any).text;
				}

				// 如果是字符串，直接返回
				if (typeof lyrics === "string") {
					return lyrics;
				}
			}

			return null;
		} catch (error) {
			console.warn("Failed to extract lyrics from metadata:", error);
			return null;
		}
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
