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
	private onMetadataUpdate?: (metadata: Map<string, TrackMetadata>) => void;
	private coverLoadingQueue: Set<string> = new Set();
	private coverLoadingTimeout: NodeJS.Timeout | null = null;

	constructor(app: App) {
		this.app = app;
		this.parser = new MetadataParser();
	}

	/**
	 * 设置元数据更新回调
	 */
	setMetadataUpdateCallback(callback: (metadata: Map<string, TrackMetadata>) => void): void {
		this.onMetadataUpdate = callback;
	}

	/**
	 * 从设置中初始化缓存（轻量级初始化）
	 */
	initializeFromSettings(settings: PluginSettings): void {
		this.cache.clear();
		
		if (settings.metadata) {
			Object.entries(settings.metadata).forEach(([path, metadata]) => {
				// 轻量级初始化：只保存基本信息，封面延迟加载
				const lightMetadata: TrackMetadata = {
					title: metadata.title,
					artist: metadata.artist,
					album: metadata.album,
					cover: null // 封面延迟加载，避免阻塞启动
				};
				this.cache.set(path, lightMetadata);
			});
		}
		
		console.log(`MetadataManager initialized with ${this.cache.size} cached entries (covers delayed)`);
		this.notifyUpdate();
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
		console.log("MetadataManager: Starting full metadata refresh");
		
		const validFolders = musicFolderPaths.filter(p => p && p.trim() !== "");
		if (validFolders.length === 0) {
			console.warn("MetadataManager: No valid music folders");
			return;
		}

		// 清空现有缓存
		this.cache.clear();
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

		console.log(`MetadataManager: Found ${musicFiles.length} music files`);

		// 处理每个文件
		let processedCount = 0;
		for (const file of musicFiles) {
			try {
				const metadata = await this.extractFileMetadata(file);
				this.cache.set(file.path, metadata);
				processedCount++;

				// 每处理5个文件就通知一次更新
				if (processedCount % 5 === 0) {
					this.notifyUpdate();
					await new Promise(resolve => setTimeout(resolve, 10));
				}
			} catch (error) {
				console.error(`MetadataManager: Failed to process ${file.path}:`, error);
				// 添加默认元数据
				const defaultMetadata: TrackMetadata = {
					title: file.basename,
					artist: "未知艺术家",
					album: "未知专辑",
					cover: null
				};
				this.cache.set(file.path, defaultMetadata);
			}
		}

		console.log(`MetadataManager: Processed ${processedCount} files, cache size: ${this.cache.size}`);
		this.notifyUpdate();
		this.scheduleSave();
	}

	/**
	 * 提取单个文件的元数据
	 */
	private async extractFileMetadata(file: TFile): Promise<TrackMetadata> {
		const arrayBuffer = await this.app.vault.readBinary(file);
		return await this.parser.extractMetadata(arrayBuffer);
	}

	/**
	 * 获取文件的元数据
	 */
	getMetadata(filePath: string): TrackMetadata | null {
		const metadata = this.cache.get(filePath);
		if (metadata) {
			// 如果没有封面，尝试异步加载
			if (!metadata.cover) {
				this.loadCoverAsync(filePath);
			}
		}
		return metadata || null;
	}

	/**
	 * 异步加载封面（防抖处理）
	 */
	private loadCoverAsync(filePath: string): void {
		// 避免重复加载
		if (this.coverLoadingQueue.has(filePath)) {
			return;
		}
		
		this.coverLoadingQueue.add(filePath);
		
		// 防抖处理，避免同时加载太多封面
		if (this.coverLoadingTimeout) {
			clearTimeout(this.coverLoadingTimeout);
		}
		
		this.coverLoadingTimeout = setTimeout(async () => {
			const filesToLoad = Array.from(this.coverLoadingQueue);
			this.coverLoadingQueue.clear();
			
			// 限制同时加载数量，避免阻塞UI
			const batchSize = 3;
			for (let i = 0; i < filesToLoad.length; i += batchSize) {
				const batch = filesToLoad.slice(i, i + batchSize);
				await Promise.all(batch.map(path => this.loadCoverForFile(path)));
				
				// 批次间稍作延迟
				if (i + batchSize < filesToLoad.length) {
					await new Promise(resolve => setTimeout(resolve, 100));
				}
			}
		}, 200);
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
					this.notifyUpdate();
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
				console.log(`MetadataManager: Removed metadata for deleted file ${filePath}`);
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
							console.log(`MetadataManager: Updated metadata for ${filePath}`);
						}
					} catch (error) {
						console.error(`MetadataManager: Failed to update metadata for ${filePath}:`, error);
					}
					this.notifyUpdate();
					this.scheduleSave();
				}, 500);
				break;
		}

		this.notifyUpdate();
	}

	/**
	 * 通知更新
	 */
	private notifyUpdate(): void {
		if (this.onMetadataUpdate) {
			this.onMetadataUpdate(new Map(this.cache));
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
			console.log("MetadataManager: Ready to save");
		}, 1000);
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
		if (this.coverLoadingTimeout) {
			clearTimeout(this.coverLoadingTimeout);
		}
		this.parser.cleanup();
		this.cache.clear();
		this.coverLoadingQueue.clear();
	}
}