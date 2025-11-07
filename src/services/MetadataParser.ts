import * as mm from "music-metadata";
import { TrackMetadata } from "../types";
import { DEFAULT_METADATA } from "../utils/constants";

export class MetadataParser {
	// 不再需要blob URL管理，所有封面使用data URL

	/**
	 * 从音频文件中提取元数据
	 */
	async extractMetadata(
		arrayBuffer: ArrayBuffer,
		existingCover?: string | null
	): Promise<TrackMetadata> {
		try {
			// 使用 music-metadata 库提取元数据
			const metadata = await mm.parseBuffer(Buffer.from(arrayBuffer));

			return {
				title: metadata.common.title || "未知标题",
				artist: metadata.common.artist || "未知艺术家",
				album: metadata.common.album || "未知专辑",
				cover: await this.extractCover(
					metadata.common.picture,
					existingCover
				),
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
		pictures: mm.IPicture[] | undefined,
		existingCover?: string | null
	): Promise<string | null> {
		// 优先使用现有的有效封面数据
		if (existingCover && this.isValidCoverData(existingCover)) {
			return existingCover;
		}

		if (!pictures || pictures.length === 0) {
			return existingCover || null; // 如果没有新的图片数据，保留现有数据
		}

		try {
			// 使用第一张图片（通常是封面）
			const picture = pictures[0];

			// 检查是否已经有相同的图片数据（通过比较文件大小和格式）
			if (
				existingCover &&
				this.isSamePictureData(picture, existingCover)
			) {
				return existingCover;
			}

			// 智能图片处理：根据大小选择不同策略
			const imageSizeKB = picture.data.length / 1024;

			try {
				// 策略1: 小图片直接处理（<= 500KB）
				if (imageSizeKB <= 500) {
					return this.createDataUrl(picture);
				}

				// 策略2: 中等图片优先压缩（500KB - 2MB）
				if (imageSizeKB <= 2048) {
					console.log(
						`Processing cover image (${imageSizeKB.toFixed(
							1
						)}KB), attempting compression...`
					);
					const compressedDataUrl = await this.compressImage(picture);

					if (compressedDataUrl) {
						return compressedDataUrl;
					}

					// 压缩失败，但图片大小可接受，使用原图
					console.log(
						`Compression not available, using original image (${imageSizeKB.toFixed(
							1
						)}KB)`
					);
					return this.createDataUrl(picture);
				}

				// 策略3: 大图片仅在压缩可用时处理（2MB - 5MB）
				if (imageSizeKB <= 5120) {
					console.log(
						`Large cover image detected (${imageSizeKB.toFixed(
							1
						)}KB), compression required`
					);
					const compressedDataUrl = await this.compressImage(picture);

					if (compressedDataUrl) {
						return compressedDataUrl;
					}

					console.warn(
						`Image too large and compression failed (${imageSizeKB.toFixed(
							1
						)}KB), skipping`
					);
					return existingCover || null;
				}

				// 策略4: 超大图片直接跳过（> 5MB）
				console.warn(
					`Image extremely large (${imageSizeKB.toFixed(
						1
					)}KB), skipping to prevent performance issues`
				);
				return existingCover || null;
			} catch (dataUrlError) {
				console.warn("Failed to process cover image:", dataUrlError);
				// 不再回退到blob URL，直接返回现有封面或null
				return existingCover || null;
			}
		} catch (error) {
			console.warn("Failed to extract cover:", error);
			return existingCover || null; // 出错时保留现有数据
		}
	}

	/**
	 * 检查封面数据是否有效
	 */
	private isValidCoverData(cover: string): boolean {
		if (!cover || typeof cover !== "string") {
			return false;
		}

		// data URL是首选格式，始终有效
		if (cover.startsWith("data:image/")) {
			return true;
		}

		// HTTP URL需要进一步验证
		if (cover.startsWith("http")) {
			return true; // 暂时认为有效，实际使用时会验证
		}

		// 不再支持blob URL
		return false;
	}

	/**
	 * 检查图片数据是否相同（简单检查）
	 */
	private isSamePictureData(
		picture: mm.IPicture,
		existingCover: string
	): boolean {
		if (!existingCover || !picture) {
			return false;
		}

		// 对于data URL，可以比较格式和数据大小
		if (existingCover.startsWith("data:")) {
			const mimeType = `image/${picture.format}`;
			if (!existingCover.startsWith(`data:${mimeType}`)) {
				return false;
			}

			// 进一步比较数据长度（粗略检查）
			const dataStartIndex = existingCover.indexOf(",") + 1;
			const base64Data = existingCover.substring(dataStartIndex);
			const expectedLength = Math.ceil((picture.data.length * 4) / 3); // base64编码后的大约长度

			// 如果长度差异超过10%，认为是不同的图片
			if (
				Math.abs(base64Data.length - expectedLength) >
				expectedLength * 0.1
			) {
				return false;
			}

			return true; // 格式和大小都匹配，认为是相同的图片
		}

		return false;
	}

	/**
	 * 压缩图片以减小文件大小
	 */
	private async compressImage(picture: mm.IPicture): Promise<string | null> {
		try {
			// 检测运行环境
			if (typeof window !== "undefined" && window.document) {
				// 浏览器环境：使用Canvas API压缩
				return await this.compressImageInBrowser(picture);
			} else {
				// Node.js环境：使用简化策略
				return this.compressImageInNode(picture);
			}
		} catch (error) {
			console.warn("Failed to compress image:", error);
			return null;
		}
	}

	/**
	 * 在Node.js环境中的图片处理策略
	 */
	private compressImageInNode(picture: mm.IPicture): string | null {
		try {
			const imageSizeKB = picture.data.length / 1024;

			// 对于Node.js环境，我们采用更宽松的策略：
			// 1. 检查原始数据大小和格式
			const isJpeg =
				picture.format === "jpeg" || picture.format === "jpg";
			const isPng = picture.format === "png";
			const isWebp = picture.format === "webp";

			// 2. JPEG格式通常压缩得更好，可以接受更大的尺寸
			if (isJpeg && imageSizeKB <= 1500) {
				console.log(
					`Accepting JPEG image (${imageSizeKB.toFixed(1)}KB)`
				);
				return this.createDataUrl(picture);
			}

			// 3. WebP格式也有不错的压缩比
			if (isWebp && imageSizeKB <= 1200) {
				console.log(
					`Accepting WebP image (${imageSizeKB.toFixed(1)}KB)`
				);
				return this.createDataUrl(picture);
			}

			// 4. PNG格式通常较大，限制更严格
			if (isPng && imageSizeKB <= 1000) {
				console.log(
					`Accepting PNG image (${imageSizeKB.toFixed(1)}KB)`
				);
				return this.createDataUrl(picture);
			}

			// 5. 其他格式或超过限制的，尝试创建但给出警告
			if (imageSizeKB <= 2048) {
				console.log(
					`Large image (${imageSizeKB.toFixed(1)}KB ${
						picture.format
					}), processing anyway`
				);
				return this.createDataUrl(picture);
			}

			// 6. 太大的图片放弃处理
			console.log(
				`Image too large (${imageSizeKB.toFixed(1)}KB), skipping`
			);
			return null;
		} catch (error) {
			console.warn("Failed to process image in Node.js:", error);
			return null;
		}
	}

	/**
	 * 在浏览器环境中压缩图片
	 */
	private async compressImageInBrowser(
		picture: mm.IPicture
	): Promise<string | null> {
		return new Promise((resolve) => {
			try {
				const originalDataUrl = this.createDataUrl(picture);
				const img = new Image();

				img.onload = () => {
					try {
						// 创建canvas进行压缩
						const canvas = document.createElement("canvas");
						const ctx = canvas.getContext("2d");

						if (!ctx) {
							resolve(null);
							return;
						}

						// 计算压缩后的尺寸
						let { width, height } = img;
						const maxDimension = 800; // 最大边长800px

						if (width > maxDimension || height > maxDimension) {
							const ratio = Math.min(
								maxDimension / width,
								maxDimension / height
							);
							width *= ratio;
							height *= ratio;
						}

						// 设置canvas尺寸
						canvas.width = width;
						canvas.height = height;

						// 绘制并压缩图片
						ctx.drawImage(img, 0, 0, width, height);

						// 尝试不同的压缩质量
						const qualities = [0.8, 0.6, 0.4, 0.2];

						for (const quality of qualities) {
							const compressedDataUrl = canvas.toDataURL(
								"image/jpeg",
								quality
							);
							const sizeKB =
								(compressedDataUrl.length / 1024) * 0.75;

							if (sizeKB <= 500) {
								// 目标500KB以下
								console.log(
									`Compressed image from ${
										picture.data.length / 1024
									}KB to ~${sizeKB.toFixed(
										1
									)}KB (quality: ${quality})`
								);
								resolve(compressedDataUrl);
								return;
							}
						}

						// 如果所有质量都太大，返回最低质量版本
						const finalDataUrl = canvas.toDataURL(
							"image/jpeg",
							0.2
						);
						resolve(finalDataUrl);
					} catch (error) {
						console.warn(
							"Failed to compress image on canvas:",
							error
						);
						resolve(null);
					}
				};

				img.onerror = () => {
					console.warn("Failed to load image for compression");
					resolve(null);
				};

				img.src = originalDataUrl;
			} catch (error) {
				console.warn("Failed to setup image compression:", error);
				resolve(null);
			}
		});
	}

	/**
	 * 将图片数据转换为data URL（优于blob URL，因为它可以序列化和持久化）
	 */
	private createDataUrl(picture: mm.IPicture): string {
		try {
			const uint8Array = new Uint8Array(picture.data);

			// 对于大图片，分块处理以避免调用栈溢出
			let binaryString = "";
			const chunkSize = 8192; // 8KB chunks

			for (let i = 0; i < uint8Array.length; i += chunkSize) {
				const chunk = uint8Array.slice(i, i + chunkSize);
				binaryString += String.fromCharCode.apply(
					null,
					Array.from(chunk)
				);
			}

			const base64 = btoa(binaryString);
			const mimeType = `image/${picture.format}`;
			return `data:${mimeType};base64,${base64}`;
		} catch (error) {
			console.warn("Failed to create data URL:", error);
			throw error;
		}
	}

	/**
	 * 从元数据中提取歌词
	 * 支持多种音频格式的歌词标签
	 */
	private extractLyrics(metadata: mm.IAudioMetadata): string | null {
		try {
			// 1. 首先尝试从 common.lyrics 获取（music-metadata 标准化后的字段）
			if (
				metadata.common.lyrics &&
				Array.isArray(metadata.common.lyrics)
			) {
				for (const lyric of metadata.common.lyrics) {
					const lyricAny = lyric as any;
					if (
						lyricAny &&
						typeof lyricAny === "string" &&
						lyricAny.trim()
					) {
						return lyricAny.trim();
					}
					if (
						lyricAny &&
						typeof lyricAny === "object" &&
						"text" in lyricAny
					) {
						const text = lyricAny.text;
						if (text && typeof text === "string" && text.trim()) {
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
						const lyricsText = this.extractLyricsText(
							txxxValue.text
						);
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
				const itunesNative =
					metadata.native["iTunes"] || metadata.native["mp4"];
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
						if (
							line &&
							typeof line === "object" &&
							"text" in line
						) {
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
	 * 清理资源（由于不再使用blob URL，此方法现在为空）
	 */
	cleanup(): void {
		// 由于不再使用blob URL，无需清理资源
		// 保留此方法以维持接口一致性
	}
}
