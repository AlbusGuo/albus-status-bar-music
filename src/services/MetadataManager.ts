import { App, TFile } from "obsidian";
import { TrackMetadata, PluginSettings } from "../types";
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
	getInitializationProgress(): { current: number; total: number; percentage: number } {
		return {
			current: this.processedTracks,
			total: this.totalTracks,
			percentage: this.totalTracks > 0 ? (this.processedTracks / this.totalTracks) * 100 : 100
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
				// 智能初始化：过滤掉失效的blob URL，只保留有效的封面数据
				let validCover = metadata.cover;
				
				// 如果是blob URL，在初始化时设为null，避免加载错误
				if (validCover && validCover.startsWith('blob:')) {
					validCover = null; // blob URL会在refreshMetadata时重新生成
				}
				
				const fullMetadata: TrackMetadata = {
					title: metadata.title,
					artist: metadata.artist,
					album: metadata.album,
					cover: validCover, // 只保留有效的封面数据
					lyrics: metadata.lyrics || null // 保留歌词数据
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
		
		const validFolders = musicFolderPaths.filter(p => p && p.trim() !== "");
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

		validFolders.forEach(folderPath => {
			const normalizedPath = normalizePath(folderPath);
			allFiles.forEach(file => {
				if (file.path.startsWith(normalizedPath) && isSupportedAudioFile(file.name)) {
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
			const processingPromise = this.processFileIfNeeded(file, existingData);
			processingPromise.then(() => {
				processedCount++;
			}).catch(() => {
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
			console.warn('MetadataManager: 无法加载现有数据，将重新处理所有文件:', error);
		}
		
		return { metadata: {} };
	}

	/**
	 * 根据需要处理文件
	 */
	private async processFileIfNeeded(file: TFile, existingData: any): Promise<void> {
		try {
			// 检查文件是否已存在于现有数据中
			if (existingData.metadata && existingData.metadata[file.path]) {
				const existingMetadata = existingData.metadata[file.path];
				
				// 验证现有数据的完整性
				if (existingMetadata.title && existingMetadata.artist) {
					// 数据完整，直接使用现有数据
					const metadata: TrackMetadata = {
						title: existingMetadata.title,
						artist: existingMetadata.artist,
						album: existingMetadata.album || "未知专辑",
						cover: existingMetadata.cover || null,
						lyrics: existingMetadata.lyrics || null // 保留歌词数据
					};
					
					this.cache.set(file.path, metadata);
					return; // 跳过重新处理
				}
			}

			// 文件不存在或数据不完整，需要重新处理
			const metadata = await this.extractFileMetadata(file);
			this.cache.set(file.path, metadata);
			
		} catch (error) {
			console.error(`MetadataManager: 处理文件失败 ${file.path}:`, error);
			// 添加默认元数据
			const defaultMetadata: TrackMetadata = {
				title: file.basename,
				artist: "未知艺术家",
				album: "未知专辑",
				cover: null,
				lyrics: null // 添加歌词字段
			};
			this.cache.set(file.path, defaultMetadata);
		}
	}

	/**
	 * 提取单个文件的元数据
	 */
	private async extractFileMetadata(file: TFile): Promise<TrackMetadata> {
		const arrayBuffer = await this.app.vault.readBinary(file);
		const metadata = await this.parser.extractMetadata(arrayBuffer);
		
		return metadata;
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
	handleFileChange(filePath: string, type: 'create' | 'delete' | 'modify'): void {
		const isMusicFile = isSupportedAudioFile(filePath.split('/').pop() || '');
		
		if (!isMusicFile) {
			return;
		}

		this.isDirty = true;

		switch (type) {
			case 'delete':
				this.cache.delete(filePath);
				// Removed metadata for deleted file
				this.scheduleSave(); // 立即保存删除的元数据
				break;
			
			case 'create':
			case 'modify':
				// 延迟处理，确保文件已完全写入
				setTimeout(async () => {
					try {
						const file = this.app.vault.getAbstractFileByPath(filePath);
						if (file instanceof TFile) {
							const metadata = await this.extractFileMetadata(file);
							this.cache.set(filePath, metadata);
							// Updated metadata for file
							this.scheduleSave(); // 立即保存更新的元数据
						}
					} catch (error) {
						console.error(`MetadataManager: Failed to update metadata for ${filePath}:`, error);
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