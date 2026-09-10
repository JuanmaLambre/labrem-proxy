import fs from "fs";
import path from "path";
import os from "os";

jest.mock("axios");

describe("triggerReboot", () => {
  describe("when the experience has no configured reboot target", () => {
    it("does not make an HTTP request", async () => {
      // No REBOOT_TARGETS_CONFIG is set for this test, so the module falls
      // back to {} (mirrors production behavior when rebootTargets.json is absent).
      const axios = (await import("axios")).default;
      const { triggerReboot } = await import("../src/reboot.ts");

      triggerReboot("some-unconfigured-experience-id");

      expect(axios.post).not.toHaveBeenCalled();
    });

    it("does nothing when experienceId is undefined", async () => {
      const axios = (await import("axios")).default;
      const { triggerReboot } = await import("../src/reboot.ts");

      triggerReboot(undefined);

      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe("when the experience has a configured reboot target", () => {
    let tmpDir: string;

    beforeEach(() => {
      jest.resetModules();

      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reboot-test-"));
      fs.writeFileSync(
        path.join(tmpDir, "rebootTargets.json"),
        JSON.stringify({ "exp-1": "http://nucleo.labremotos.fi.uba.ar/reboot.php" }),
      );

      process.env.REBOOT_TARGETS_CONFIG = path.join(tmpDir, "rebootTargets.json");
      process.env.REBOOT_SECRET = "test-secret";
    });

    afterEach(() => {
      delete process.env.REBOOT_TARGETS_CONFIG;
      delete process.env.REBOOT_SECRET;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("posts to the configured URL with the shared secret header", async () => {
      const axios = (await import("axios")).default as jest.Mocked<typeof import("axios").default>;
      axios.post.mockResolvedValue({ status: 200 });
      const { triggerReboot } = await import("../src/reboot.ts");

      triggerReboot("exp-1");
      await new Promise(process.nextTick);

      expect(axios.post).toHaveBeenCalledWith(
        "http://nucleo.labremotos.fi.uba.ar/reboot.php",
        null,
        expect.objectContaining({ headers: { "X-Reboot-Secret": "test-secret" } }),
      );
    });

    it("does not throw when the request fails", async () => {
      const axios = (await import("axios")).default as jest.Mocked<typeof import("axios").default>;
      axios.post.mockRejectedValue(new Error("connection refused"));
      const { triggerReboot } = await import("../src/reboot.ts");

      expect(() => triggerReboot("exp-1")).not.toThrow();
    });

    describe("and REBOOT_SECRET is not set", () => {
      beforeEach(() => {
        delete process.env.REBOOT_SECRET;
      });

      it("does not make the request", async () => {
        const axios = (await import("axios")).default;
        const { triggerReboot } = await import("../src/reboot.ts");

        triggerReboot("exp-1");

        expect(axios.post).not.toHaveBeenCalled();
      });
    });
  });
});
