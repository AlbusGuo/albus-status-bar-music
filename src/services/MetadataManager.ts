import { App, TFile } from "obsidian";
import { PluginSettings, TrackMetadata } from "../types";
import { isSupportedAudioFile, normalizePath } from "../utils/helpers";
import { MetadataParser } from "./MetadataParser";

/**
 * 全新的元数据管理器
 * 解决设置生命周期和数据同步问题
 */
export class MetadataManager {
	private app: App;
	private parser: MetadataParser;
	private cache: Map<string, TrackMetadata> = new Map();
	private isDirty: boolean = false;
	private saveTimeout: NodeJS.Timeout | null = null;
	private onSaveNeeded?: () => void;
	private isInitialized: boolean = false;
	private totalTracks: number = 0;
	private processedTracks: number = 0;

	constructor(app: App) {
		this.app = app;
		this.parser = new MetadataParser();
	}

	/**
	 * 设置保存回调
	 */
	setSaveCallback(callback: () => void): void {
		this.onSaveNeeded = callback;
	}

	/**
	 * 检查是否已完全初始化
	 */
	isFullyInitialized(): boolean {
		return this.isInitialized;
	}

	/**
	 * 获取初始化进度
	 */
	getInitializationProgress(): {
		current: number;
		total: number;
		percentage: number;
	} {
		return {
			current: this.processedTracks,
			total: this.totalTracks,
			percentage:
				this.totalTracks > 0
					? (this.processedTracks / this.totalTracks) * 100
					: 100,
		};
	}

	/**
	 * 从设置中初始化缓存（轻量级初始化）
	 */
	initializeFromSettings(settings: PluginSettings): void {
		this.cache.clear();
		this.isInitialized = false;
		this.processedTracks = 0;

		if (settings.metadata) {
			this.totalTracks = Object.keys(settings.metadata).length;

			Object.entries(settings.metadata).forEach(([path, metadata]) => {
				// 智能初始化：验证并保留有效的封面数据
				const validCover = this.validateAndPreserveCover(
					metadata.cover
				);

				const fullMetadata: TrackMetadata = {
					title: metadata.title,
					artist: metadata.artist,
					album: metadata.album || "未知专辑",
					cover: validCover, // 经过验证的封面数据
					lyrics: metadata.lyrics || null, // 保留歌词数据
				};
				this.cache.set(path, fullMetadata);
				this.processedTracks++;
			});
		} else {
			this.totalTracks = 0;
		}

		// 标记为已初始化
		this.isInitialized = true;
	}

	/**
	 * 将缓存导出到设置
	 */
	exportToSettings(): PluginSettings {
		const metadata: Record<string, TrackMetadata> = {};

		this.cache.forEach((trackMetadata, path) => {
			metadata[path] = trackMetadata;
		});

		return { metadata } as PluginSettings;
	}

	/**
	 * 扫描并提取所有音乐文件的元数据
	 */
	async refreshAllMetadata(musicFolderPaths: string[]): Promise<void> {
		// 开始完整元数据刷新

		const validFolders = musicFolderPaths.filter(
			(p) => p && p.trim() !== ""
		);
		if (validFolders.length === 0) {
			// 无有效音乐文件夹
			return;
		}

		// 获取现有数据（从data.json）
		const existingData = await this.loadExistingData();

		// 不清空现有缓存，保留已有数据
		this.isDirty = true;

		// 获取所有音乐文件
		const allFiles = this.app.vault.getFiles();
		const musicFiles: TFile[] = [];

		validFolders.forEach((folderPath) => {
			const normalizedPath = normalizePath(folderPath);
			allFiles.forEach((file) => {
				if (
					file.path.startsWith(normalizedPath) &&
					isSupportedAudioFile(file.name)
				) {
					musicFiles.push(file);
				}
			});
		});

		// 发现音乐文件

		// 批量处理所有文件，等待全部完成后再更新UI
		const processingPromises: Promise<void>[] = [];
		let processedCount = 0;
		let skippedCount = 0;

		for (const file of musicFiles) {
			const processingPromise = this.processFileIfNeeded(
				file,
				existingData
			);
			processingPromise
				.then(() => {
					processedCount++;
				})
				.catch(() => {
					// 即使出错也算作处理完成
					processedCount++;
				});
			processingPromises.push(processingPromise);
		}

		// 等待所有文件处理完成
		await Promise.allSettled(processingPromises);

		// 统计跳过的文件数量
		for (const file of musicFiles) {
			if (existingData.metadata && existingData.metadata[file.path]) {
				skippedCount++;
			}
		}

		// 文件处理完成

		// 所有文件处理完成后，保存设置
		this.scheduleSave();
	}

	/**
	 * 加载现有数据
	 */
	private async loadExistingData(): Promise<any> {
		try {
			// 尝试读取插件数据文件
			const configDir = this.app.vault.configDir;
			const dataPath = `${configDir}/plugins/albus-status-bar-music/data.json`;

			const dataFile = this.app.vault.getAbstractFileByPath(dataPath);
			if (dataFile instanceof TFile) {
				const content = await this.app.vault.read(dataFile);
				return JSON.parse(content);
			}
		} catch (error) {
			console.warn(
				"MetadataManager: 无法加载现有数据，将重新处理所有文件:",
				error
			);
		}

		return { metadata: {} };
	}

	/**
	 * 根据需要处理文件
	 */
	private async processFileIfNeeded(
		file: TFile,
		existingData: any
	): Promise<void> {
		try {
			// 检查文件是否已存在于现有数据中
			if (existingData.metadata && existingData.metadata[file.path]) {
				const existingMetadata = existingData.metadata[file.path];

				// 使用新的验证逻辑检查是否需要重新处理
				const needsReprocessing = await this.shouldReprocessFile(
					file,
					existingMetadata
				);

				if (!needsReprocessing) {
					// 数据完整且有效，直接使用现有数据，优先保留已有的封面数据
					const metadata: TrackMetadata = {
						title: existingMetadata.title,
						artist: existingMetadata.artist,
						album: existingMetadata.album || "未知专辑",
						cover: this.validateAndPreserveCover(
							existingMetadata.cover
						),
						lyrics: existingMetadata.lyrics || null, // 保留歌词数据
					};

					this.cache.set(file.path, metadata);
					return; // 跳过重新处理
				}
			}

			// 检查缓存中是否已有该文件的完整元数据（避免重复处理）
			const cachedMetadata = this.cache.get(file.path);
			if (cachedMetadata) {
				const needsReprocessing = await this.shouldReprocessFile(
					file,
					cachedMetadata
				);
				if (!needsReprocessing) {
					// 缓存中已有完整数据，无需重新处理
					return;
				}
			}

			// 文件不存在、数据不完整或需要重新处理
			// 传递现有的有效封面数据，避免不必要的重新生成
			const existingCover = this.validateAndPreserveCover(
				existingData.metadata?.[file.path]?.cover ||
					cachedMetadata?.cover
			);

			const metadata = await this.extractFileMetadata(
				file,
				existingCover
			);
			this.cache.set(file.path, metadata);
		} catch (error) {
			console.error(`MetadataManager: 处理文件失败 ${file.path}:`, error);
			// 添加默认元数据，但保留现有的有效封面数据
			const existingCover = this.validateAndPreserveCover(
				existingData.metadata?.[file.path]?.cover
			);

			const defaultMetadata: TrackMetadata = {
				title: file.basename,
				artist: "未知艺术家",
				album: "未知专辑",
				cover: existingCover,
				lyrics: null,
			};
			this.cache.set(file.path, defaultMetadata);
		}
	}

	/**
	 * 提取单个文件的元数据
	 */
	private async extractFileMetadata(
		file: TFile,
		existingCover?: string | null
	): Promise<TrackMetadata> {
		const arrayBuffer = await this.app.vault.readBinary(file);
		const metadata = await this.parser.extractMetadata(
			arrayBuffer,
			existingCover
		);

		return metadata;
	}

	/**
	 * 验证并保留有效的封面数据
	 */
	private validateAndPreserveCover(
		cover: string | null | undefined
	): string | null {
		if (!cover || typeof cover !== "string") {
			return null;
		}

		// 不再支持blob URL，直接设为null让系统重新生成data URL
		if (cover.startsWith("blob:")) {
			return null;
		}

		// 如果是data URL，验证格式并保留
		if (cover.startsWith("data:image/")) {
			// data URL格式: data:image/[subtype];base64,[data]
			const parts = cover.split(",");
			if (parts.length === 2 && parts[0].includes("base64")) {
				try {
					// 简单验证base64数据
					atob(parts[1].substring(0, 10)); // 只验证前10个字符
					return cover;
				} catch (error) {
					console.warn("Invalid base64 data in cover data URL");
					return null;
				}
			}
		}

		// 如果是HTTP URL，保留（但实际使用时需要验证可访问性）
		if (cover.startsWith("http")) {
			return cover;
		}

		// 其他情况返回null
		return null;
	}

	/**
	 * 检查文件是否需要重新处理元数据
	 * 基于文件修改时间和缓存时间戳
	 */
	private async shouldReprocessFile(
		file: TFile,
		existingMetadata: any
	): Promise<boolean> {
		if (
			!existingMetadata ||
			!existingMetadata.title ||
			!existingMetadata.artist
		) {
			return true; // 数据不完整，需要重新处理
		}

		// 如果没有封面数据，可能需要重新处理以提取封面
		if (!existingMetadata.cover) {
			return true;
		}

		// 如果元数据缺少歌词，可能需要重新处理
		if (!existingMetadata.lyrics) {
			return true;
		}

		// 其他情况认为数据完整，无需重新处理
		return false;
	}

	/**
	 * 获取文件的元数据
	 */
	getMetadata(filePath: string): TrackMetadata | null {
		return this.cache.get(filePath) || null;
	}

	/**
	 * 为单个文件加载封面
	 */
	private async loadCoverForFile(filePath: string): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				const metadata = await this.extractFileMetadata(file);
				const existingMetadata = this.cache.get(filePath);
				if (existingMetadata && metadata.cover) {
					existingMetadata.cover = metadata.cover;
				}
			}
		} catch (error) {
			console.warn(`Failed to load cover for ${filePath}:`, error);
		}
	}

	/**
	 * 获取所有元数据
	 */
	getAllMetadata(): Map<string, TrackMetadata> {
		return new Map(this.cache);
	}

	/**
	 * 获取缓存大小
	 */
	getCacheSize(): number {
		return this.cache.size;
	}

	/**
	 * 处理文件变化
	 */
	handleFileChange(
		filePath: string,
		type: "create" | "delete" | "modify"
	): void {
		const isMusicFile = isSupportedAudioFile(
			filePath.split("/").pop() || ""
		);

		if (!isMusicFile) {
			return;
		}

		this.isDirty = true;

		switch (type) {
			case "delete":
				this.cache.delete(filePath);
				// Removed metadata for deleted file
				this.scheduleSave(); // 立即保存删除的元数据
				break;

			case "create":
			case "modify":
				// 延迟处理，确保文件已完全写入
				setTimeout(async () => {
					try {
						const file =
							this.app.vault.getAbstractFileByPath(filePath);
						if (file instanceof TFile) {
							// 对于修改的文件，保留现有的封面数据（如果有的话）
							const existingMetadata = this.cache.get(filePath);
							const existingCover = existingMetadata?.cover;

							const metadata = await this.extractFileMetadata(
								file,
								existingCover
							);
							this.cache.set(filePath, metadata);
							// Updated metadata for file
							this.scheduleSave(); // 立即保存更新的元数据
						}
					} catch (error) {
						console.error(
							`MetadataManager: Failed to update metadata for ${filePath}:`,
							error
						);
					}
				}, 500);
				break;
		}
	}

	/**
	 * 计划保存（防抖）
	 */
	private scheduleSave(): void {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}

		this.saveTimeout = setTimeout(() => {
			this.isDirty = false;
			// 通知主插件保存设置
			if (this.onSaveNeeded) {
				this.onSaveNeeded();
			}
		}, 500); // 减少延迟，确保及时保存
	}

	/**
	 * 检查是否需要保存
	 */
	needsSave(): boolean {
		return this.isDirty;
	}

	/**
	 * 清理资源
	 */
	cleanup(): void {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}
		this.parser.cleanup();
		this.cache.clear();
	}
}
