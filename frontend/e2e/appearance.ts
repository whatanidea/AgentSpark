import { expect, type Locator } from "@playwright/test";

export async function expectReadable(root: Locator) {
  await expect(async () => {
    const issues = await root.evaluate(container => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("A canvas context is required to resolve computed CSS colors.");
      const colors = new Map<string, number[]>();
      const channels = (color: string) => {
        const cached = colors.get(color);
        if (cached) return cached;
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const values = [...context.getImageData(0, 0, 1, 1).data];
        values[3] /= 255;
        colors.set(color, values);
        return values;
      };
      const luminance = (color: number[]) => {
        const [r, g, b] = color.slice(0, 3).map(value => {
          const channel = value / 255;
          return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        });
        return .2126 * r + .7152 * g + .0722 * b;
      };
      return [...container.querySelectorAll("*")].flatMap(element => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (!bounds.width || !bounds.height || style.visibility === "hidden" ||
            ![...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) return [];
        let background = [255, 255, 255];
        let remaining = 1;
        let composite = [0, 0, 0];
        for (let ancestor: Element | null = element; ancestor && remaining > 0; ancestor = ancestor.parentElement) {
          const color = channels(getComputedStyle(ancestor).backgroundColor);
          const alpha = color[3] ?? 1;
          composite = composite.map((value, index) => value + color[index] * alpha * remaining);
          remaining *= 1 - alpha;
        }
        background = composite.map((value, index) => value + background[index] * remaining);
        const foreground = channels(style.color);
        const alpha = foreground[3] ?? 1;
        const text = luminance(foreground.map((value, index) => index < 3 ? value * alpha + background[index] * (1 - alpha) : value));
        const surface = luminance(background);
        const ratio = (Math.max(text, surface) + .05) / (Math.min(text, surface) + .05);
        return ratio < 4.5 ? [{ text: element.textContent?.trim().slice(0, 70), ratio, selector: element.className }] : [];
      });
    });
    expect(issues, "Visible text must retain at least 4.5:1 contrast against its actual surface").toEqual([]);
  }).toPass({ timeout: 5000, intervals: [50, 100, 250] });
}
