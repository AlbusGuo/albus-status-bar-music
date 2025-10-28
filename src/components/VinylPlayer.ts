import { MusicTrack } from "../types";

/**
 * 黑胶唱片播放器组件
 * 模拟网易云音乐的唱片播放器样式
 */
export class VinylPlayer {
	private containerEl: HTMLElement;
	private vinylDisc: HTMLElement;
	private coverImage: HTMLElement;
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

		// 黑胶唱片容器（可点击）
		this.vinylDisc = this.containerEl.createEl("div", {
			cls: "vinyl-disc"
		});
		
		// 让唱片本身可点击来控制播放/暂停
		this.vinylDisc.addEventListener("click", () => {
			this.events.onPlayPause?.();
		});
		this.vinylDisc.style.cursor = "pointer";

		// 唱片纹理
		this.createVinylTexture();

		// 封面容器（占据整个中心区域）
		const coverContainer = this.vinylDisc.createEl("div", {
			cls: "vinyl-cover-container",
		});

		// 封面图片
		this.coverImage = coverContainer.createEl("div", {
			cls: "vinyl-cover",
		});

		// 添加样式
		this.addStyles();
	}

	/**
	 * 创建唱片纹理效果
	 */
	private createVinylTexture(): void {
		// 创建音轨纹路效果
		for (let i = 0; i < 3; i++) {
			const groove = this.vinylDisc.createEl("div", {
				cls: `vinyl-groove vinyl-groove-${i + 1}`
			});
		}

		// 创建高光效果
		const shine = this.vinylDisc.createEl("div", {
			cls: "vinyl-shine"
		});
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
		} else {
			this.stopRotation();
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
	 * 添加样式
	 */
	private addStyles(): void {
		const style = document.createElement('style');
		style.textContent = `
		.vinyl-player {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 20px;
		}		.vinyl-disc {
			width: 140px;
			height: 140px;
			border-radius: 50%;
			position: relative;
			transform-origin: center center;
			transition: box-shadow 0.3s ease;
			box-shadow: 
				0 8px 32px rgba(0, 0, 0, 0.6),
				inset 0 2px 4px rgba(255, 255, 255, 0.1),
				inset 0 -2px 4px rgba(0, 0, 0, 0.8);
			background: 
				radial-gradient(circle at 30% 30%, 
					rgba(40, 40, 40, 0.9) 0%, 
					rgba(20, 20, 20, 0.95) 30%, 
					rgba(0, 0, 0, 1) 60%, 
					rgba(0, 0, 0, 1) 100%),
				linear-gradient(45deg, 
					rgba(0, 0, 0, 1) 0%, 
					rgba(10, 10, 10, 0.98) 50%, 
					rgba(0, 0, 0, 1) 100%);
			overflow: hidden;
		}			.vinyl-disc:hover {
				box-shadow: 
					0 12px 40px rgba(0, 0, 0, 0.7),
					inset 0 2px 6px rgba(255, 255, 255, 0.15),
					inset 0 -2px 6px rgba(0, 0, 0, 0.9);
				transform: scale(1.02);
			}

		.vinyl-groove {
			position: absolute;
			border-radius: 50%;
			border: 0.5px solid rgba(255, 255, 255, 0.08);
			box-shadow: 
				inset 0 1px 3px rgba(0, 0, 0, 0.9),
				0 0 1px rgba(255, 255, 255, 0.05);
			background: transparent;
		}			.vinyl-groove-1 {
				top: 5%;
				left: 5%;
				width: 90%;
				height: 90%;
			}

			.vinyl-groove-2 {
				top: 15%;
				left: 15%;
				width: 70%;
				height: 70%;
			}

			.vinyl-groove-3 {
				top: 25%;
				left: 25%;
				width: 50%;
				height: 50%;
			}

		.vinyl-cover-container {
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			width: 90px;
			height: 90px;
			border-radius: 50%;
			overflow: hidden;
			z-index: 3;
			box-shadow: 
				0 8px 24px rgba(0, 0, 0, 0.8),
				inset 0 1px 2px rgba(255, 255, 255, 0.2),
				inset 0 -1px 2px rgba(0, 0, 0, 0.8),
				0 0 0 1px var(--interactive-accent);
			border: 3px solid #0a0a0a;
			background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%);
		}			.vinyl-cover {
				width: 100%;
				height: 100%;
				background-color: var(--background-secondary);
				background-size: cover;
				background-position: center;
				display: flex;
				align-items: center;
				justify-content: center;
				transition: opacity 0.3s ease;
			}

		.vinyl-cover:not(.has-cover)::before {
			content: "♪";
			font-size: 24px;
			color: #666666;
		}

		.vinyl-cover:not(.has-cover) {
			background: #1a1a1a;
		}			.vinyl-shine {
				position: absolute;
				top: 10%;
				left: 15%;
				width: 35%;
				height: 35%;
				border-radius: 50%;
				background: 
					radial-gradient(circle at 40% 40%, 
						rgba(255, 255, 255, 0.4) 0%, 
						rgba(255, 255, 255, 0.2) 20%, 
						rgba(255, 255, 255, 0.1) 40%, 
						transparent 70%);
				z-index: 2;
				pointer-events: none;
				mix-blend-mode: overlay;
			}

			/* 添加第二层高光 */
			.vinyl-shine::before {
				content: '';
				position: absolute;
				top: 20%;
				left: 25%;
				width: 20%;
				height: 20%;
				border-radius: 50%;
				background: radial-gradient(circle, 
					rgba(255, 255, 255, 0.3) 0%, 
					transparent 60%);
			}

			/* 添加边缘反光 */
			.vinyl-disc::before {
				content: '';
				position: absolute;
				top: -2px;
				left: -2px;
				right: -2px;
				bottom: -2px;
				border-radius: 50%;
				background: linear-gradient(45deg, 
					transparent 30%, 
					rgba(255, 255, 255, 0.1) 50%, 
					transparent 70%);
				z-index: 1;
				pointer-events: none;
			}

		/* JavaScript控制旋转，无需CSS动画 */			/* 悬停效果 */
			.vinyl-disc:hover {
				box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
			}

			

			/* 响应式设计 */
			@media (max-width: 600px) {
				.vinyl-disc {
					width: 110px;
					height: 110px;
				}

				.vinyl-cover-container {
					width: 70px;
					height: 70px;
				}
			}
		`;
		document.head.appendChild(style);

		// 清理样式
		this.cleanup = () => {
			if (style.parentNode) {
				style.parentNode.removeChild(style);
			}
		};
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
		if (this.cleanup) {
			this.cleanup();
		}
	}
}