import { App, Modal, Setting } from "obsidian";

/**
 * 确认对话框模态框
 */
export class ConfirmModal extends Modal {
	private title: string;
	private message: string;
	private confirmText: string;
	private onConfirm: () => void;
	private onCancel?: () => void;

	constructor(
		app: App,
		title: string,
		message: string,
		confirmText: string,
		onConfirm: () => void,
		onCancel?: () => void
	) {
		super(app);
		this.title = title;
		this.message = message;
		this.confirmText = confirmText;
		this.onConfirm = onConfirm;
		this.onCancel = onCancel;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// 标题
		contentEl.createEl("h2", { text: this.title });

		// 消息内容
		const messageEl = contentEl.createEl("p", {
			cls: "confirm-modal-message"
		});
		messageEl.setText(this.message);

		// 按钮容器
		const buttonContainer = contentEl.createEl("div", {
			cls: "confirm-modal-buttons"
		});

		// 取消按钮
		const cancelButton = buttonContainer.createEl("button", {
			cls: "mod-cta",
			text: "取消"
		});
		cancelButton.onclick = () => {
			this.close();
			if (this.onCancel) {
				this.onCancel();
			}
		};

		// 确认按钮
		const confirmButton = buttonContainer.createEl("button", {
			cls: "mod-warning",
			text: this.confirmText
		});
		confirmButton.onclick = () => {
			this.close();
			this.onConfirm();
		};

		// 样式
		this.addStyles();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * 添加样式
	 */
	private addStyles(): void {
		const style = document.createElement('style');
		style.textContent = `
			.confirm-modal-message {
				margin: 16px 0;
				line-height: 1.5;
				white-space: pre-line;
			}
			
			.confirm-modal-buttons {
				display: flex;
				gap: 12px;
				justify-content: flex-end;
				margin-top: 20px;
			}
			
			.confirm-modal-buttons button {
				padding: 8px 16px;
				border: none;
				border-radius: 4px;
				cursor: pointer;
				font-size: 14px;
			}
			
			.confirm-modal-buttons .mod-cta {
				background-color: var(--interactive-normal);
				color: var(--text-normal);
			}
			
			.confirm-modal-buttons .mod-cta:hover {
				background-color: var(--interactive-hover);
			}
			
			.confirm-modal-buttons .mod-warning {
				background-color: var(--color-red);
				color: var(--text-on-accent);
			}
			
			.confirm-modal-buttons .mod-warning:hover {
				background-color: var(--color-red-hover, #d32f2f);
			}
		`;
		document.head.appendChild(style);

		// 清理样式
		this.onClose = () => {
			if (style.parentNode) {
				style.parentNode.removeChild(style);
			}
		};
	}
}