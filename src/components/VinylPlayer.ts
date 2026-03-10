import { MusicTrack } from "../types";
import { NEEDLE_IMAGE } from "../assets/needle";

/**
 * 黑胶唱片播放器组件
 * 模拟网易云音乐的唱片播放器样式
 */
export class VinylPlayer {
	private containerEl: HTMLElement;
	private vinylDisc: HTMLElement;
	private coverImage: HTMLElement;
	private tonearmEl: HTMLElement;
	private isPlaying: boolean = false;
	private rotationAngle: number = 0;
	private animationFrame: number | null = null;
	private lastTimestamp: number = 0;

	private events: {
		onPlayPause?: () => void;
	} = {};

	constructor(container: HTMLElement) {
		this.containerEl = container;
		this.createElements();
	}

/**
	 * 创建DOM元素
	 */
	private createElements(): void {
		// 主容器
		this.containerEl.addClass("vinyl-player");

		// 唱片针（位于唱片上方，不随唱片旋转）
		this.tonearmEl = this.containerEl.createEl("div", {
			cls: "vinyl-tonearm",
		});
		const needleImg = this.tonearmEl.createEl("img", {
			cls: "needle-image",
		});
		needleImg.src = NEEDLE_IMAGE;
		needleImg.draggable = false;

		// 黑胶唱片容器（可点击）
		this.vinylDisc = this.containerEl.createEl("div", {
			cls: "vinyl-disc"
		});
		
		// 让唱片本身可点击来控制播放/暂停
		this.vinylDisc.addEventListener("click", () => {
			this.events.onPlayPause?.();
		});
		this.vinylDisc.style.cursor = "pointer";

		// 封面容器（占据整个中心区域）
		const coverContainer = this.vinylDisc.createEl("div", {
			cls: "vinyl-cover-container",
		});

		// 封面图片
		this.coverImage = coverContainer.createEl("div", {
			cls: "vinyl-cover",
		});
	}

	/**
	 * 重置旋转角度为0（切歌时调用，防止新曲目继承旧角度导致封面闪烁）
	 * 通过停止/重启 rAF 循环确保不会被残留回调覆盖
	 */
	resetRotation(): void {
		const wasPlaying = this.isPlaying;
		if (this.animationFrame) {
			cancelAnimationFrame(this.animationFrame);
			this.animationFrame = null;
		}
		this.rotationAngle = 0;
		this.lastTimestamp = 0;
		this.vinylDisc.style.transform = 'rotate(0deg)';
		this.vinylDisc.style.setProperty('--vinyl-counter-rotation', '0deg');
		if (wasPlaying) {
			this.startRotation();
		}
	}

	/**
	 * 设置当前播放的曲目
	 */
	setTrack(track: MusicTrack | null): void {
		if (track?.metadata?.cover) {
			this.coverImage.style.backgroundImage = `url(${track.metadata.cover})`;
			this.coverImage.style.backgroundSize = "cover";
			this.coverImage.style.backgroundPosition = "center";
			this.coverImage.classList.add("has-cover");
		} else {
			// 默认封面
			this.coverImage.style.backgroundImage = "";
			this.coverImage.style.backgroundSize = "";
			this.coverImage.style.backgroundPosition = "";
			this.coverImage.classList.remove("has-cover");
		}
	}

	/**
	 * 设置播放状态
	 */
	setPlaying(isPlaying: boolean): void {
		if (this.isPlaying === isPlaying) return;

		this.isPlaying = isPlaying;

		if (isPlaying) {
			this.startRotation();
			this.tonearmEl.addClass("playing");
		} else {
			this.stopRotation();
			this.tonearmEl.removeClass("playing");
		}
	}

	/**
	 * 抬起唱片针（切歌动画时调用）
	 */
	liftTonearm(): void {
		this.tonearmEl.removeClass("playing");
	}

	/**
	 * 放下唱片针（切歌动画结束时调用）
	 */
	lowerTonearm(): void {
		if (this.isPlaying) {
			this.tonearmEl.addClass("playing");
		}
	}

	

	/**
	 * 开始旋转
	 */
	private startRotation(): void {
		if (this.animationFrame) return;

		const animate = (timestamp: number) => {
			if (!this.lastTimestamp) {
				this.lastTimestamp = timestamp;
			}

			const deltaTime = timestamp - this.lastTimestamp;
			this.lastTimestamp = timestamp;

			// 旋转速度：每10秒转一圈 (36度/秒)
			const rotationSpeed = 36; // 度/秒
			this.rotationAngle += (rotationSpeed * deltaTime) / 1000;

			// 保持角度在0-360范围内
			if (this.rotationAngle >= 360) {
				this.rotationAngle -= 360;
			}

			// 应用旋转
			this.vinylDisc.style.transform = `rotate(${this.rotationAngle}deg)`;
			this.vinylDisc.style.setProperty('--vinyl-counter-rotation', `${-this.rotationAngle}deg`);

			if (this.isPlaying) {
				this.animationFrame = requestAnimationFrame(animate);
			}
		};

		this.animationFrame = requestAnimationFrame(animate);
	}

	/**
	 * 停止旋转
	 */
	private stopRotation(): void {
		if (this.animationFrame) {
			cancelAnimationFrame(this.animationFrame);
			this.animationFrame = null;
		}
		this.lastTimestamp = 0;
	}

	/**
	 * 获取容器元素
	 */
	getElement(): HTMLElement {
		return this.containerEl;
	}

	/**
	 * 注册事件监听器
	 */
	on(event: string, callback: () => void): void {
		(this.events as any)[event] = callback;
	}

	/**
	 * 检查是否正在播放
	 */
	isCurrentlyPlaying(): boolean {
		return this.isPlaying;
	}

	/**
	 * 清理资源
	 */
	cleanup(): void {
		this.stopRotation();
	}
}