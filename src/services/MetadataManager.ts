import { App, TFile, normalizePath } from "obsidian";
import { TrackMetadata, PluginSettings } from "../types";
import {
	collectSupportedAudioFilesFromFolder,
	isSupportedAudioFile,
} from "../utils/helpers";
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
	private onProgressUpdate?: (current: number, total: number) => void;

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
	 * 设置进度更新回调
	 */
	setProgressCallback(callback: (current: number, total: number) => void): void {
		this.onProgressUpdate = callback;
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
			
			for (const [path, metadata] of Object.entries(settings.metadata)) {
				const fullMetadata: TrackMetadata = {
					title: metadata.title,
					artist: metadata.artist,
					album: metadata.album,
					cover: metadata.cover || null,
					lyrics: metadata.lyrics || null
				};
				this.cache.set(path, fullMetadata);
				this.processedTracks++;
			}
		} else {
			this.totalTracks = 0;
		}
		
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
	 * 已缓存且完整的文件直接跳过，仅处理新增或不完整的文件
	 */
	async refreshAllMetadata(musicFolderPaths: string[]): Promise<void> {
		const validFolders = musicFolderPaths.filter(p => p && p.trim() !== "");
		if (validFolders.length === 0) {
			return;
		}

		const musicFiles: TFile[] = [];

		for (const folderPath of validFolders) {
			const normalizedPath = normalizePath(folderPath);
			musicFiles.push(
				...collectSupportedAudioFilesFromFolder(this.app, normalizedPath)
			);
		}

		this.totalTracks = musicFiles.length;
		this.processedTracks = 0;
		
		if (this.totalTracks === 0) {
			this.isInitialized = true;
			this.onProgressUpdate?.(0, 0);
			return;
		}
		
		this.onProgressUpdate?.(0, this.totalTracks);

		// 分离：已缓存完整的文件 vs 需要处理的文件
		const filesToProcess: TFile[] = [];
		for (const file of musicFiles) {
			const cached = this.cache.get(file.path);
			if (cached?.title && cached?.artist && cached?.cover && !cached.cover.startsWith('blob:')) {
				// 缓存完整，直接跳过
				this.processedTracks++;
			} else {
				filesToProcess.push(file);
			}
		}
		
		this.onProgressUpdate?.(this.processedTracks, this.totalTracks);

		// 仅处理不完整或新增的文件
		if (filesToProcess.length > 0) {
			this.isDirty = true;
			const concurrencyLimit = 10;
			
			for (let i = 0; i < filesToProcess.length; i += concurrencyLimit) {
				const batch = filesToProcess.slice(i, i + concurrencyLimit);
				await Promise.all(batch.map(async (file) => {
					try {
						await this.processFile(file);
					} catch {
						// 错误已在 processFile 中处理
					}
					this.processedTracks++;
					this.onProgressUpdate?.(this.processedTracks, this.totalTracks);
				}));
				// 每批次处理后让出主线程，避免阻塞 Obsidian 其他进程
				await new Promise(resolve => setTimeout(resolve, 0));
			}
			
			this.scheduleSave();
		}

		this.isInitialized = true;
		this.onProgressUpdate?.(this.totalTracks, this.totalTracks);
	}

	/**
	 * 处理单个文件的元数据提取
	 */
	private async processFile(file: TFile): Promise<void> {
		try {
			const existing = this.cache.get(file.path);
			
			if (existing?.title && existing?.artist) {
				// 有部分数据（缺封面），仅补充缺失部分
				const metadata = await this.extractFileMetadata(file);
				this.cache.set(file.path, {
					title: existing.title,
					artist: existing.artist,
					album: existing.album || metadata.album,
					cover: metadata.cover,
					lyrics: existing.lyrics || metadata.lyrics || null
				});
			} else {
				// 完全新的文件，全量提取
				const metadata = await this.extractFileMetadata(file);
				this.cache.set(file.path, metadata);
			}
		} catch {
			this.cache.set(file.path, {
				title: file.basename,
				artist: "未知艺术家",
				album: "未知专辑",
				cover: null,
				lyrics: null
			});
		}
	}

	/**
	 * 提取单个文件的元数据
	 */
	private async extractFileMetadata(file: TFile): Promise<TrackMetadata> {
		const arrayBuffer = await this.app.vault.readBinary(file);
		return this.parser.extractMetadata(arrayBuffer);
	}

	

	/**
	 * 获取文件的元数据
	 */
	getMetadata(filePath: string): TrackMetadata | null {
		return this.cache.get(filePath) || null;
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
		if (!isMusicFile) return;

		this.isDirty = true;

		if (type === 'delete') {
			this.cache.delete(filePath);
			this.scheduleSave();
		} else {
			setTimeout(async () => {
				try {
					const file = this.app.vault.getAbstractFileByPath(filePath);
					if (file instanceof TFile) {
						const metadata = await this.extractFileMetadata(file);
						this.cache.set(filePath, metadata);
						this.scheduleSave();
					}
				} catch {
					// Failed to update metadata
				}
			}, 500);
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