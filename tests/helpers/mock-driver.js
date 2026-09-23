export class MockElement {
  constructor(existing = true, options = {}) {
    this._existing = existing;
    this.clicked = false;
    this.values = [];
    this._text = options.text || "";
  }

  async isExisting() {
    return this._existing;
  }

  async waitForExist() {
    if (!this._existing) {
      throw new Error("Elemento não está presente na tela");
    }
  }

  async click() {
    if (!this._existing) {
      throw new Error("Elemento não está presente na tela");
    }
    this.clicked = true;
  }

  async setValue(value) {
    if (!this._existing) {
      throw new Error("Elemento não está presente na tela");
    }
    this.values.push(value);
  }

  async getText() {
    return this._text;
  }
}

export class MockDriver {
  constructor(options = {}) {
    this.existing = new Set(options.existing || []);
    this.$errors = options.errors || {};
    this.pageSource = options.pageSource || "";
    this.texts = options.texts || {};
    this.created = [];
    this.elements = [];
  }

  async getPageSource() {
    if (typeof this.pageSource === "function") {
      return this.pageSource();
    }
    return this.pageSource;
  }

  $(selector) {
    this.created.push(selector);
    if (Object.prototype.hasOwnProperty.call(this.$errors, selector)) {
      throw this.$errors[selector];
    }
    const element = new MockElement(this.existing.has(selector), {
      text: this.texts[selector] || "",
    });
    this.elements.push(element);
    return element;
  }
}