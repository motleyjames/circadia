import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const team = require("../../scripts/ios-team.cjs") as {
  parseCodesignIdentities: (text: string) => string | null;
  teamFromCertificateSubject: (text: string) => string | null;
  parseXcodeTeamsPlist: (text: string) => string | null;
  readTeamFromXcconfig: (text: string) => string | null;
  readTeamFromPbxproj: (text: string) => string | null;
  writeSigningXcconfig: (teamId: string, root: string) => string | null;
  discoverTeam: (root: string, env?: NodeJS.ProcessEnv) => { team: string; source: string } | null;
};

const SAMPLE_TEAM = "A1B2C3D4E5";

describe("ios-team", () => {
  it("prefers a live Apple Development identity and skips expired certs", () => {
    const text = `
  1) aaa "Apple Distribution: James Motley (${SAMPLE_TEAM})"
  2) bbb "Apple Development: James Motley (${SAMPLE_TEAM})"
  3) ccc "Apple Development: Old (${SAMPLE_TEAM})" (CSSMERR_TP_CERT_EXPIRED)
`;
    expect(team.parseCodesignIdentities(text)).toBe(SAMPLE_TEAM);
    expect(team.parseCodesignIdentities("    0 valid identities found")).toBeNull();
  });

  it("reads Team from a certificate subject, xcconfig, pbxproj, and Xcode defaults", () => {
    expect(
      team.teamFromCertificateSubject(
        `subject=UID=ABC/CN=Apple Development: James Motley (${SAMPLE_TEAM})/OU=${SAMPLE_TEAM}/O=James Motley/C=US`,
      ),
    ).toBe(SAMPLE_TEAM);
    expect(team.readTeamFromXcconfig(`DEVELOPMENT_TEAM = ${SAMPLE_TEAM}\nCODE_SIGN_STYLE = Automatic\n`)).toBe(
      SAMPLE_TEAM,
    );
    expect(team.readTeamFromPbxproj(`DEVELOPMENT_TEAM = ${SAMPLE_TEAM};\nCODE_SIGN_STYLE = Automatic;`)).toBe(
      SAMPLE_TEAM,
    );
    expect(team.parseXcodeTeamsPlist(`teamID = ${SAMPLE_TEAM};\nteamName = "James Motley";`)).toBe(SAMPLE_TEAM);
  });

  it("writes a gitignored xcconfig and includes it from debug.xcconfig", () => {
    const root = mkdtempSync(join(tmpdir(), "circadia-team-"));
    mkdirSync(join(root, "phone", "ios"), { recursive: true });
    writeFileSync(join(root, "phone", "ios", "debug.xcconfig"), "CAPACITOR_DEBUG = true\n");
    expect(team.writeSigningXcconfig(SAMPLE_TEAM, root)).toBe(SAMPLE_TEAM);
    const xcconfig = readFileSync(join(root, "phone", "ios", "signing.xcconfig"), "utf8");
    expect(xcconfig).toContain(`DEVELOPMENT_TEAM = ${SAMPLE_TEAM}`);
    expect(xcconfig).toContain("CODE_SIGN_STYLE = Automatic");
    expect(readFileSync(join(root, "phone", "ios", "debug.xcconfig"), "utf8")).toContain(
      '#include? "signing.xcconfig"',
    );
    expect(
      team.discoverTeam(root, { ...process.env, CIRCADIA_DEVELOPMENT_TEAM: SAMPLE_TEAM })?.source,
    ).toBe("env");
    rmSync(root, { recursive: true, force: true });
  });
});
