import { AudioPlayerEvents, MusicTrack } from "../types";
import { throttle } from "../utils/helpers";

export class AudioPlayerService {
	private audio: HTMLAudioElement;
	private events: Partial<AudioPlayerEvents> = {};
	private isPlaying: boolean = false;
	private currentTrack: MusicTrack | null = null;

	constructor() {
		this.audio = new Audio();
		this.setupEventListeners();
	}

	/**
	 * 注册事件监听器
	 */
	on<K extends keyof AudioPlayerEvents>(
		event: K,
		callback: AudioPlayerEvents[K]
	): void {
		this.events[event] = callback;
	}

	/**
	 * 触发事件
	 */
	private emit<K extends keyof AudioPlayerEvents>(
		event: K,
		...args: Parameters<AudioPlayerEvents[K]>
	): void {
		const callback = this.events[event];
		if (callback) {
			(callback as any)(...args);
		}
	}

	/**
	 * 设置音频播放器事件监听
	 */
	private setupEventListeners(): void {
		this.audio.addEventListener("play", () => {
			this.isPlaying = true;
			this.emit("onPlay");
		});

		this.audio.addEventListener("pause", () => {
			this.isPlaying = false;
			this.emit("onPause");
		});

		this.audio.addEventListener("ended", () => {
			this.isPlaying = false;
			this.emit("onEnded");
		});

		this.audio.addEventListener("loadstart", () => {
			this.emit("onLoadStart");
		});

		this.audio.addEventListener("canplay", () => {
			this.emit("onLoadEnd");
		});

		this.audio.addEventListener("error", (e) => {
			console.error("Audio player error:", e);
			this.emit("onError", new Error("Audio playback error"));
		});

		// 使用节流来限制进度更新频率
		const throttledTimeUpdate = throttle(() => {
			this.emit("onTimeUpdate");
		}, 100);

		this.audio.addEventListener("timeupdate", throttledTimeUpdate);
	}

	/**
	 * 加载曲目
	 */
	loadTrack(track: MusicTrack): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!track) {
				reject(new Error("No track provided"));
				return;
			}

			this.currentTrack = track;

			// 如果已经是同一首歌，不需要重新加载
			if (this.audio.src === track.resourcePath) {
				resolve();
				return;
			}

			const handleCanPlay = () => {
				this.audio.removeEventListener("canplay", handleCanPlay);
				this.audio.removeEventListener("error", handleError);
				resolve();
			};

			const handleError = (e: Event) => {
				this.audio.removeEventListener("canplay", handleCanPlay);
				this.audio.removeEventListener("error", handleError);
				reject(new Error(`Failed to load track: ${track.name}`));
			};

			this.audio.addEventListener("canplay", handleCanPlay, {
				once: true,
			});
			this.audio.addEventListener("error", handleError, { once: true });

			this.audio.src = track.resourcePath;
			this.audio.load();
		});
	}

	/**
	 * 播放
	 */
	async play(): Promise<void> {
		if (!this.currentTrack) {
			throw new Error("No track loaded");
		}

		try {
			await this.audio.play();
		} catch (error) {
			console.error("Play error:", error);
			this.emit("onError", error as Error);
			throw error;
		}
	}

	/**
	 * 暂停
	 */
	pause(): void {
		this.audio.pause();
	}

	/**
	 * 切换播放/暂停
	 */
	async togglePlayPause(): Promise<void> {
		if (this.isPlaying) {
			this.pause();
		} else {
			await this.play();
		}
	}

	/**
	 * 跳转到指定时间
	 */
	seekTo(time: number): void {
		if (this.audio.duration && isFinite(this.audio.duration)) {
			this.audio.currentTime = Math.max(
				0,
				Math.min(time, this.audio.duration)
			);
		}
	}

	/**
	 * 按百分比跳转
	 */
	seekToPercent(percent: number): void {
		const clampedPercent = Math.max(0, Math.min(1, percent));
		if (this.audio.duration && isFinite(this.audio.duration)) {
			this.seekTo(clampedPercent * this.audio.duration);
		}
	}

	/**
	 * 设置音量
	 */
	setVolume(volume: number): void {
		this.audio.volume = Math.max(0, Math.min(1, volume));
	}

	/**
	 * 设置播放速度
	 */
	setPlaybackRate(rate: number): void {
		this.audio.playbackRate = Math.max(0.25, Math.min(4, rate));
	}

	/**
	 * 获取当前播放时间
	 */
	getCurrentTime(): number {
		return this.audio.currentTime || 0;
	}

	/**
	 * 获取总时长
	 */
	getDuration(): number {
		return this.audio.duration || 0;
	}

	/**
	 * 获取播放进度（0-1）
	 */
	getProgress(): number {
		const duration = this.getDuration();
		if (!duration || !isFinite(duration)) {
			return 0;
		}
		return this.getCurrentTime() / duration;
	}

	/**
	 * 获取缓冲进度
	 */
	getBufferedPercent(): number {
		if (this.audio.buffered.length === 0) {
			return 0;
		}

		const duration = this.getDuration();
		if (!duration || !isFinite(duration)) {
			return 0;
		}

		const bufferedEnd = this.audio.buffered.end(
			this.audio.buffered.length - 1
		);
		return bufferedEnd / duration;
	}

	/**
	 * 检查是否正在播放
	 */
	getIsPlaying(): boolean {
		return this.isPlaying;
	}

	/**
	 * 获取当前曲目
	 */
	getCurrentTrack(): MusicTrack | null {
		return this.currentTrack;
	}

	/**
	 * 检查是否已加载
	 */
	isLoaded(): boolean {
		return this.audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
	}

	/**
	 * 检查是否可以播放
	 */
	canPlay(): boolean {
		return this.audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA;
	}

	/**
	 * 获取音频元素（用于高级操作）
	 */
	getAudioElement(): HTMLAudioElement {
		return this.audio;
	}

	/**
	 * 停止播放并清理
	 */
	stop(): void {
		this.pause();
		this.audio.currentTime = 0;
	}

	/**
	 * 清理资源
	 */
	cleanup(): void {
		this.stop();
		this.audio.src = "";
		this.audio.load();
		this.currentTrack = null;
		this.events = {};
	}
}
