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

		contentEl.createEl("h2", { text: this.title });

		const messageEl = contentEl.createEl("p", {
			cls: "confirm-modal-message"
		});
		messageEl.setText(this.message);

		const buttonContainer = contentEl.createEl("div", {
			cls: "confirm-modal-buttons"
		});

		const cancelButton = buttonContainer.createEl("button", {
			cls: "mod-cta",
			text: "Cancel"
		});
		cancelButton.onclick = () => {
			this.close();
			if (this.onCancel) {
				this.onCancel();
			}
		};

		const confirmButton = buttonContainer.createEl("button", {
			cls: "mod-warning",
			text: this.confirmText
		});
		confirmButton.onclick = () => {
			this.close();
			this.onConfirm();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}