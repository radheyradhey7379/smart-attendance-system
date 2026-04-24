/**
 * V2.0 Security: Hardware-Linked Fingerprinting
 * Generates a SHA-256 hash based on device entropy.
 */
export const getDeviceFingerprint = async (): Promise<string> => {
    const entropy = [
        navigator.userAgent,
        window.screen.width + 'x' + window.screen.height,
        new Date().getTimezoneOffset(),
        navigator.platform,
        navigator.language,
        // Add canvas fingerprinting for higher entropy
        getCanvasFingerprint()
    ].join('|');

    return computeHash(entropy);
};

const getCanvasFingerprint = (): string => {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return 'no-canvas';

        ctx.textBaseline = "top";
        ctx.font = "14px 'Arial'";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#f60";
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = "#069";
        ctx.fillText("SmartAttendanceV2.0", 2, 15);
        ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
        ctx.fillText("SmartAttendanceV2.0", 4, 17);

        return canvas.toDataURL();
    } catch (e) {
        return 'canvas-blocked';
    }
};

const computeHash = async (input: string): Promise<string> => {
    const msgUint8 = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};
