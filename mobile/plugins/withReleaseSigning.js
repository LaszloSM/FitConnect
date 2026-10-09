/**
 * Firma del APK de release sin EAS: si el entorno trae la llave
 * (FC_KEYSTORE_PATH, FC_KEYSTORE_PASSWORD, FC_KEY_ALIAS y opcional
 * FC_KEY_PASSWORD) se firma con ella; si no, con la llave de depuración y el
 * APK solo sirve para pruebas. La llave nunca entra al repo: en CI sale de los
 * secrets del repositorio.
 */
const { withAppBuildGradle } = require("expo/config-plugins");

const RELEASE_CONFIG = `
        release {
            if (System.getenv("FC_KEYSTORE_PATH")) {
                storeFile file(System.getenv("FC_KEYSTORE_PATH"))
                storePassword System.getenv("FC_KEYSTORE_PASSWORD")
                keyAlias System.getenv("FC_KEY_ALIAS")
                keyPassword System.getenv("FC_KEY_PASSWORD") ?: System.getenv("FC_KEYSTORE_PASSWORD")
            }
        }`;

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes("FC_KEYSTORE_PATH")) return cfg;
    const block = src.match(/signingConfigs\s*\{\s*\n\s*debug\s*\{[\s\S]*?\n\s{8}\}/);
    if (!block) throw new Error("withReleaseSigning: no encontré signingConfigs.debug en app/build.gradle");
    src = src.replace(block[0], block[0] + RELEASE_CONFIG);
    const release = src.match(/buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?signingConfig signingConfigs\.debug/);
    if (!release) throw new Error("withReleaseSigning: no encontré buildTypes.release en app/build.gradle");
    src = src.replace(
      release[0],
      release[0].replace(/signingConfig signingConfigs\.debug$/, 'signingConfig System.getenv("FC_KEYSTORE_PATH") ? signingConfigs.release : signingConfigs.debug'),
    );
    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = withReleaseSigning;
