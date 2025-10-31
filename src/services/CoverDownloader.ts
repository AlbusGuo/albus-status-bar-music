import { App, TFile } from "obsidian";
import { TrackMetadata } from "../types";

/**
 * 封面下载服务
 * 支持从免费音乐平台搜索和下载封面
 */
export class CoverDownloader {
	private app: App;
	private readonly API_ENDPOINTS = {
		// iTunes Search API (免费，无需API key)
		itunes: (artist: string, track: string) => 
			`https://itunes.apple.com/search?term=${encodeURIComponent(`${artist} ${track}`)}&entity=song&limit=5`,
		
		// Deezer API (免费，无需API key) - 作为备用
		deezer: (artist: string, track: string) => 
			`https://api.deezer.com/search?q=${encodeURIComponent(`${artist} ${track}`)}&limit=5`
	};
	
	// 网络请求配置
	private readonly REQUEST_TIMEOUT = 8000; // 8秒超时
	private readonly MAX_RETRIES = 2; // 最大重试次数
	private readonly RETRY_DELAY = 1000; // 重试延迟

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 为音乐文件搜索并下载封面
	 */
	async downloadCoverForTrack(artist: string, title: string, album?: string): Promise<string | null> {
		try {
			// Searching cover
			
			// 尝试多个API源
			const coverUrls = await this.searchCoverFromMultipleSources(artist, title, album);
			
			if (coverUrls.length === 0) {
				// No cover found
				return null;
			}

			// 尝试下载第一个可用的封面
			for (const url of coverUrls) {
				try {
					const coverData = await this.downloadCoverImage(url);
					if (coverData) {
						// Successfully downloaded cover
						return coverData;
					}
				} catch (error) {
					console.warn(`CoverDownloader: Failed to download from ${url}:`, error);
					continue;
				}
			}

			return null;
		} catch (error) {
			console.error(`CoverDownloader: Error downloading cover for "${title}":`, error);
			return null;
		}
	}

	/**
	 * 从多个API源搜索封面
	 */
	private async searchCoverFromMultipleSources(artist: string, title: string, album?: string): Promise<string[]> {
		const results: string[] = [];

		// 1. 首先尝试 iTunes API (最可靠)
		try {
			const itunesResults = await this.searchFromiTunes(artist, title, album);
			if (itunesResults.length > 0) {
				results.push(...itunesResults);
				// iTunes found covers
			}
		} catch (error) {
			console.warn('CoverDownloader: iTunes search failed:', this.getErrorMessage(error));
		}

		// 2. 如果iTunes没有结果，尝试Deezer API（作为备用）
		if (results.length === 0) {
			try {
				const deezerResults = await this.searchFromDeezer(artist, title, album);
				if (deezerResults.length > 0) {
					results.push(...deezerResults);
					// Deezer found covers
				}
			} catch (error) {
				console.warn('CoverDownloader: Deezer search failed:', this.getErrorMessage(error));
			}
		}

		// 去重并返回
		return [...new Set(results)];
	}

	/**
	 * 从 iTunes API 搜索封面
	 */
	private async searchFromiTunes(artist: string, title: string, album?: string): Promise<string[]> {
		return await this.withRetry(async () => {
			const response = await this.fetchWithTimeout(this.API_ENDPOINTS.itunes(artist, title));
			
			if (!response.ok) {
				throw new Error(`iTunes API HTTP ${response.status}: ${response.statusText}`);
			}
			
			const data = await response.json();
			
			if (data.results && data.results.length > 0) {
				return data.results
					.filter((track: any) => track.artworkUrl100)
					.map((track: any) => {
						// 获取最高分辨率的封面
						return track.artworkUrl100.replace('100x100', '1200x1200');
					});
			}
			
			return [];
		}, 'iTunes');
	}

	/**
	 * 从 Deezer API 搜索封面
	 */
	private async searchFromDeezer(artist: string, title: string, album?: string): Promise<string[]> {
		return await this.withRetry(async () => {
			const response = await this.fetchWithTimeout(this.API_ENDPOINTS.deezer(artist, title));
			
			if (!response.ok) {
				throw new Error(`Deezer API HTTP ${response.status}: ${response.statusText}`);
			}
			
			const data = await response.json();
			
			if (data.data && data.data.length > 0) {
				return data.data
					.filter((track: any) => track.album && track.album.cover_medium)
					.map((track: any) => track.album.cover_xl || track.album.cover_big || track.album.cover_medium);
			}
			
			return [];
		}, 'Deezer');
	}

	

	/**
	 * 下载封面图片
	 */
	private async downloadCoverImage(url: string): Promise<string | null> {
		try {
			const response = await this.fetchWithTimeout(url);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const arrayBuffer = await response.arrayBuffer();
			const uint8Array = new Uint8Array(arrayBuffer);
			
			// 转换为 base64
			const base64 = this.arrayBufferToBase64(uint8Array);
			const mimeType = this.getMimeTypeFromUrl(url);
			
			return `data:${mimeType};base64,${base64}`;
		} catch (error) {
			console.warn(`CoverDownloader: Failed to download image from ${url}:`, this.getErrorMessage(error));
			return null;
		}
	}

	/**
	 * ArrayBuffer 转 Base64
	 */
	private arrayBufferToBase64(buffer: Uint8Array): string {
		let binary = '';
		const bytes = new Uint8Array(buffer);
		const len = bytes.byteLength;
		for (let i = 0; i < len; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	/**
	 * 从URL获取MIME类型
	 */
	private getMimeTypeFromUrl(url: string): string {
		const extension = url.split('.').pop()?.toLowerCase();
		switch (extension) {
			case 'jpg':
			case 'jpeg':
				return 'image/jpeg';
			case 'png':
				return 'image/png';
			case 'webp':
				return 'image/webp';
			case 'gif':
				return 'image/gif';
			default:
				return 'image/jpeg';
		}
	}

	/**
	 * 检查是否需要下载封面
	 */
	shouldDownloadCover(metadata: TrackMetadata): boolean {
		// 如果没有封面，或者封面是默认的，则需要下载
		return !metadata.cover || metadata.cover === '';
	}

	/**
	 * 生成搜索关键词
	 */
	private generateSearchKeywords(artist: string, title: string, album?: string): string {
		// 优先使用 artist + title
		if (artist && title) {
			return `${artist} ${title}`;
		}
		
		// 如果没有标题，使用 artist + album
		if (artist && album) {
			return `${artist} ${album}`;
		}
		
		// 如果只有其中一个，直接使用
		return artist || title || album || '';
	}

	/**
	 * 带超时的fetch请求
	 */
	private async fetchWithTimeout(url: string): Promise<Response> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

		try {
			const response = await fetch(url, {
				signal: controller.signal,
				headers: {
					'User-Agent': 'Obsidian-Music-Plugin/1.0'
				}
			});
			clearTimeout(timeoutId);
			return response;
		} catch (error) {
			clearTimeout(timeoutId);
			if (error instanceof Error && error.name === 'AbortError') {
				throw new Error(`Request timeout after ${this.REQUEST_TIMEOUT}ms`);
			}
			throw error;
		}
	}

	/**
	 * 带重试的操作
	 */
	private async withRetry<T>(
		operation: () => Promise<T>,
		apiName: string
	): Promise<T> {
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= this.MAX_RETRIES + 1; attempt++) {
			try {
				return await operation();
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				
				if (attempt <= this.MAX_RETRIES) {
					console.warn(`${apiName} search attempt ${attempt} failed, retrying in ${this.RETRY_DELAY}ms:`, this.getErrorMessage(lastError));
					await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
				} else {
					console.error(`${apiName} search failed after ${this.MAX_RETRIES + 1} attempts:`, this.getErrorMessage(lastError));
				}
			}
		}

		throw lastError;
	}

	/**
	 * 获取友好的错误信息
	 */
	private getErrorMessage(error: any): string {
		if (error instanceof Error) {
			if (error.message.includes('timeout') || error.message.includes('AbortError')) {
				return 'Network timeout';
			}
			if (error.message.includes('Failed to fetch')) {
				return 'Network connection failed';
			}
			if (error.message.includes('HTTP 403')) {
				return 'API access forbidden';
			}
			if (error.message.includes('HTTP 429')) {
				return 'API rate limit exceeded';
			}
			if (error.message.includes('HTTP 5')) {
				return 'API server error';
			}
			return error.message;
		}
		return 'Unknown error';
	}
}