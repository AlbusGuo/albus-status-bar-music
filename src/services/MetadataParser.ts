import { ID3v2Frame, TrackMetadata } from "../types";
import { DEFAULT_METADATA } from "../utils/constants";

export class MetadataParser {
	private blobUrls = new Map<string, Blob>();

	/**
	 * 从音频文件中提取元数据
	 */
	async extractMetadata(arrayBuffer: ArrayBuffer): Promise<TrackMetadata> {
		try {
			return this.parseID3v2(arrayBuffer);
		} catch (error) {
			console.error("Failed to extract metadata:", error);
			return { ...DEFAULT_METADATA };
		}
	}

	/**
	 * 解析ID3v2标签
	 */
	private parseID3v2(arrayBuffer: ArrayBuffer): TrackMetadata {
		const dataView = new DataView(arrayBuffer);
		const metadata: TrackMetadata = { ...DEFAULT_METADATA };

		if (dataView.byteLength < 10) {
			return metadata;
		}

		// 检查ID3v2标签头
		const header = this.readString(dataView, 0, 3);
		if (header !== "ID3") {
			return metadata;
		}

		const tagSize = this.readSyncSafeInt(dataView, 6);
		let offset = 10;

		while (offset < tagSize + 10 && offset + 10 < dataView.byteLength) {
			const frame = this.readFrame(dataView, offset);
			if (!frame) break;

			this.parseFrame(frame, metadata);
			offset += 10 + frame.size;
		}

		return metadata;
	}

	/**
	 * 读取帧数据
	 */
	private readFrame(dataView: DataView, offset: number): ID3v2Frame | null {
		if (offset + 10 > dataView.byteLength) {
			return null;
		}

		const id = this.readString(dataView, offset, 4);
		if (!/^[A-Z0-9]{4}$/.test(id)) {
			return null;
		}

		const size = this.readSyncSafeInt(dataView, offset + 4);
		const flags = dataView.getUint16(offset + 8);

		if (size === 0 || offset + 10 + size > dataView.byteLength) {
			return null;
		}

		const data = new Uint8Array(size);
		for (let i = 0; i < size; i++) {
			data[i] = dataView.getUint8(offset + 10 + i);
		}

		return { id, size, flags, data };
	}

	/**
	 * 解析特定帧
	 */
	private parseFrame(frame: ID3v2Frame, metadata: TrackMetadata): void {
		switch (frame.id) {
			case "TIT2": // 标题
				metadata.title =
					this.parseTextFrame(frame.data) || metadata.title;
				break;
			case "TPE1": // 艺术家
				metadata.artist =
					this.parseTextFrame(frame.data) || metadata.artist;
				break;
			case "TALB": // 专辑
				metadata.album =
					this.parseTextFrame(frame.data) || metadata.album;
				break;
			case "APIC": // 封面
				metadata.cover = this.parsePictureFrame(frame.data);
				break;
		}
	}

	/**
	 * 解析文本帧
	 */
	private parseTextFrame(data: Uint8Array): string | null {
		if (data.length < 1) return null;

		const encoding = data[0];
		const textData = data.slice(1);

		try {
			let text = "";

			switch (encoding) {
				case 0: // ISO-8859-1
				case 3: // UTF-8
					text = this.decodeText(textData, "utf-8");
					break;
				case 1: // UTF-16 with BOM
					text = this.decodeText(textData, "utf-16");
					break;
				case 2: // UTF-16BE
					text = this.decodeText(textData, "utf-16be");
					break;
			}

			// 去除空字符
			const nullIndex = text.indexOf("\x00");
			if (nullIndex !== -1) {
				text = text.substring(0, nullIndex);
			}

			return text.trim() || null;
		} catch (error) {
			console.warn("Text frame parsing error:", error);
			return null;
		}
	}

	/**
	 * 解析图片帧
	 */
	private parsePictureFrame(data: Uint8Array): string | null {
		if (data.length < 5) return null;

		try {
			let offset = 0;

			// 文本编码
			const encoding = data[offset++];

			// MIME类型
			let mimeType = "";
			while (offset < data.length && data[offset] !== 0) {
				mimeType += String.fromCharCode(data[offset++]);
			}
			offset++; // 跳过空字符

			if (offset >= data.length) return null;

			// 图片类型
			offset++; // 跳过图片类型字节

			if (offset >= data.length) return null;

			// 描述
			if (encoding === 0 || encoding === 3) {
				// 单字节编码
				while (offset < data.length && data[offset] !== 0) {
					offset++;
				}
				offset++;
			} else {
				// 双字节编码
				while (
					offset < data.length - 1 &&
					(data[offset] !== 0 || data[offset + 1] !== 0)
				) {
					offset += 2;
				}
				offset += 2;
			}

			if (offset >= data.length) return null;

			// 图片数据
			const imageData = data.slice(offset);
			if (imageData.length === 0) return null;

			return this.createBlobUrl(imageData, mimeType);
		} catch (error) {
			console.warn("Picture frame parsing error:", error);
			return null;
		}
	}

	/**
	 * 创建Blob URL
	 */
	private createBlobUrl(
		imageData: Uint8Array,
		mimeType: string
	): string | null {
		try {
			const detectedMimeType =
				mimeType || this.detectImageType(imageData);
			// 创建一个新的Uint8Array来确保正确的类型
			const arrayBuffer = new ArrayBuffer(imageData.length);
			const view = new Uint8Array(arrayBuffer);
			view.set(imageData);

			const blob = new Blob([arrayBuffer], { type: detectedMimeType });
			const blobUrl = URL.createObjectURL(blob);

			this.blobUrls.set(blobUrl, blob);
			return blobUrl;
		} catch (error) {
			console.warn("Blob URL creation error:", error);
			return null;
		}
	}

	/**
	 * 检测图片类型
	 */
	private detectImageType(data: Uint8Array): string {
		if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
			return "image/jpeg";
		}
		if (
			data[0] === 0x89 &&
			data[1] === 0x50 &&
			data[2] === 0x4e &&
			data[3] === 0x47
		) {
			return "image/png";
		}
		if (
			data[0] === 0x47 &&
			data[1] === 0x49 &&
			data[2] === 0x46 &&
			data[3] === 0x38
		) {
			return "image/gif";
		}
		if (data[0] === 0x42 && data[1] === 0x4d) {
			return "image/bmp";
		}
		return "image/jpeg";
	}

	/**
	 * 解码文本
	 */
	private decodeText(data: Uint8Array, encoding: string): string {
		try {
			return new TextDecoder(encoding).decode(data);
		} catch (error) {
			// 回退到基本解码
			return String.fromCharCode(...Array.from(data));
		}
	}

	/**
	 * 读取字符串
	 */
	private readString(
		dataView: DataView,
		offset: number,
		length: number
	): string {
		let result = "";
		for (let i = 0; i < length; i++) {
			result += String.fromCharCode(dataView.getUint8(offset + i));
		}
		return result;
	}

	/**
	 * 读取同步安全整数
	 */
	private readSyncSafeInt(dataView: DataView, offset: number): number {
		let value = 0;
		for (let i = 0; i < 4; i++) {
			value = value * 128 + dataView.getUint8(offset + i);
		}
		return value;
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
