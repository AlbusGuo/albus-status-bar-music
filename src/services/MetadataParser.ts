import { TrackMetadata } from "../types";
import { DEFAULT_METADATA } from "../utils/constants";
import * as mm from 'music-metadata';
import { IAudioMetadata, IPicture } from 'music-metadata';

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
				cover: await this.extractCover(metadata.common.picture)
			};
		} catch (error) {
			console.error("Failed to extract metadata:", error);
			return { ...DEFAULT_METADATA };
		}
	}

	/**
	 * 提取封面图片
	 */
	private async extractCover(pictures: mm.IPicture[] | undefined): Promise<string | null> {
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
	 * 清理Blob URLs
	 */
	cleanup(): void {
		this.blobUrls.forEach((blob, url) => {
			URL.revokeObjectURL(url);
		});
		this.blobUrls.clear();
	}
}
