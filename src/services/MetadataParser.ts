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

		// 获取版本信息
		const majorVersion = dataView.getUint8(3);
		const minorVersion = dataView.getUint8(4);
		const flags = dataView.getUint8(5);

		console.log(
			`ID3v2.${majorVersion}.${minorVersion} detected, flags: ${flags}`
		);

		// 检查是否支持的版本
		if (majorVersion < 2 || majorVersion > 4) {
			console.warn(
				`Unsupported ID3v2 version: ${majorVersion}.${minorVersion}`
			);
			return metadata;
		}

		const tagSize = this.readSyncSafeInt(dataView, 6);
		console.log(`Tag size: ${tagSize} bytes`);

		let offset = 10;

		// 如果有扩展头，跳过它
		if (flags & 0x40) {
			// Extended header flag
			if (offset + 4 <= dataView.byteLength) {
				const extHeaderSize = this.readSyncSafeInt(dataView, offset);
				offset += 4 + extHeaderSize;
				console.log(`Skipped extended header: ${extHeaderSize} bytes`);
			}
		}

		let frameCount = 0;
		while (offset < tagSize + 10 && offset + 10 < dataView.byteLength) {
			const frame = this.readFrame(dataView, offset);
			if (!frame) {
				// 如果遇到padding或无效帧，停止解析
				break;
			}

			console.log(`Found frame: ${frame.id}, size: ${frame.size}`);
			this.parseFrame(frame, metadata);
			frameCount++;

			offset += 10 + frame.size;

			// 避免无限循环
			if (frameCount > 50) {
				console.warn("Too many frames detected, stopping parsing");
				break;
			}
		}

		console.log(`Parsed ${frameCount} frames`);
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

		// 检查ID3v2版本来决定大小字段的读取方式
		const majorVersion = dataView.getUint8(3);
		let size: number;

		if (majorVersion >= 4) {
			// ID3v2.4 使用同步安全整数
			size = this.readSyncSafeInt(dataView, offset + 4);
		} else {
			// ID3v2.3 及更早版本使用普通的32位整数
			size = dataView.getUint32(offset + 4);
		}

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

			// 图片类型 (1字节)
			const pictureType = data[offset++];

			if (offset >= data.length) return null;

			// 描述字段 - 更准确的解析
			let descriptionBytes = 0;
			if (encoding === 0 || encoding === 3) {
				// ISO-8859-1 或 UTF-8 (单字节编码)
				while (
					offset + descriptionBytes < data.length &&
					data[offset + descriptionBytes] !== 0
				) {
					descriptionBytes++;
				}
				if (offset + descriptionBytes < data.length) {
					descriptionBytes++; // 包含终止符
				}
			} else if (encoding === 1 || encoding === 2) {
				// UTF-16 (双字节编码)
				while (offset + descriptionBytes + 1 < data.length) {
					if (
						data[offset + descriptionBytes] === 0 &&
						data[offset + descriptionBytes + 1] === 0
					) {
						descriptionBytes += 2; // 包含双字节终止符
						break;
					}
					descriptionBytes += 2;
				}
			}

			offset += descriptionBytes;

			if (offset >= data.length) return null;

			// 确保有足够的数据用于图片
			const imageData = data.slice(offset);
			if (imageData.length === 0) return null;

			// 验证图片数据的完整性
			if (!this.isValidImageData(imageData)) {
				console.warn("Invalid image data detected");
				return null;
			}

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

			// 直接使用原始数据创建Blob，避免不必要的复制
			const blob = new Blob([imageData], { type: detectedMimeType });
			const blobUrl = URL.createObjectURL(blob);

			// 存储引用以便清理
			this.blobUrls.set(blobUrl, blob);

			console.log(
				`Created blob URL for ${detectedMimeType} image, size: ${imageData.length} bytes`
			);
			return blobUrl;
		} catch (error) {
			console.warn("Blob URL creation error:", error);
			return null;
		}
	}

	/**
	 * 验证图片数据的完整性
	 */
	private isValidImageData(data: Uint8Array): boolean {
		if (data.length < 4) return false;

		// 检查常见图片格式的魔术字节
		// JPEG
		if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
			// 查找JPEG结束标记
			for (let i = data.length - 2; i >= 0; i--) {
				if (data[i] === 0xff && data[i + 1] === 0xd9) {
					return true;
				}
			}
			// 如果没有找到结束标记，但有开始标记，仍然尝试加载
			return true;
		}

		// PNG
		if (
			data[0] === 0x89 &&
			data[1] === 0x50 &&
			data[2] === 0x4e &&
			data[3] === 0x47
		) {
			return data.length >= 8; // PNG最小头部
		}

		// GIF
		if (
			data[0] === 0x47 &&
			data[1] === 0x49 &&
			data[2] === 0x46 &&
			data[3] === 0x38
		) {
			return data.length >= 6;
		}

		// BMP
		if (data[0] === 0x42 && data[1] === 0x4d) {
			return data.length >= 14;
		}

		// WebP
		if (
			data[0] === 0x52 &&
			data[1] === 0x49 &&
			data[2] === 0x46 &&
			data[3] === 0x46 &&
			data[8] === 0x57 &&
			data[9] === 0x45 &&
			data[10] === 0x42 &&
			data[11] === 0x50
		) {
			return true;
		}

		// 如果不是已知格式，但有足够的数据，尝试加载
		return data.length > 100;
	}

	/**
	 * 检测图片类型
	 */
	private detectImageType(data: Uint8Array): string {
		if (data.length < 4) return "image/jpeg"; // 默认fallback

		// JPEG
		if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
			return "image/jpeg";
		}

		// PNG
		if (
			data[0] === 0x89 &&
			data[1] === 0x50 &&
			data[2] === 0x4e &&
			data[3] === 0x47 &&
			data.length >= 8 &&
			data[4] === 0x0d &&
			data[5] === 0x0a &&
			data[6] === 0x1a &&
			data[7] === 0x0a
		) {
			return "image/png";
		}

		// GIF87a 或 GIF89a
		if (
			data[0] === 0x47 &&
			data[1] === 0x49 &&
			data[2] === 0x46 &&
			data[3] === 0x38 &&
			data.length >= 6 &&
			(data[4] === 0x37 || data[4] === 0x39) &&
			data[5] === 0x61
		) {
			return "image/gif";
		}

		// BMP
		if (data[0] === 0x42 && data[1] === 0x4d && data.length >= 14) {
			return "image/bmp";
		}

		// WebP
		if (
			data.length >= 12 &&
			data[0] === 0x52 &&
			data[1] === 0x49 &&
			data[2] === 0x46 &&
			data[3] === 0x46 &&
			data[8] === 0x57 &&
			data[9] === 0x45 &&
			data[10] === 0x42 &&
			data[11] === 0x50
		) {
			return "image/webp";
		}

		// TIFF (Little-endian)
		if (
			data.length >= 4 &&
			data[0] === 0x49 &&
			data[1] === 0x49 &&
			data[2] === 0x2a &&
			data[3] === 0x00
		) {
			return "image/tiff";
		}

		// TIFF (Big-endian)
		if (
			data.length >= 4 &&
			data[0] === 0x4d &&
			data[1] === 0x4d &&
			data[2] === 0x00 &&
			data[3] === 0x2a
		) {
			return "image/tiff";
		}

		// 默认返回JPEG
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
