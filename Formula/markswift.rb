class Markswift < Formula
  desc "Convert rendered HTML and CSS to native SwiftUI components"
  homepage "https://github.com/raelsei/markswift"
  version "3.0.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/raelsei/markswift/releases/download/v#{version}/markswift-darwin-arm64.tar.gz"
      sha256 "8050107a0f1596e4a545100b00c10ede962d6d64d4151c5bf31df32a09f54242"
    else
      url "https://github.com/raelsei/markswift/releases/download/v#{version}/markswift-darwin-x64.tar.gz"
      sha256 "4c5104858fbcb05264620cda8d3ec3f47fe5d85762d7cca70d2f77ce447f6e82"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/raelsei/markswift/releases/download/v#{version}/markswift-linux-arm64.tar.gz"
      sha256 "1ef3ff83c07827a1ba35a6df5cf0c293a44880cf916499eadc255edf64e2180c"
    else
      url "https://github.com/raelsei/markswift/releases/download/v#{version}/markswift-linux-x64.tar.gz"
      sha256 "b32afd1d24e70da84444a722707edbd7c6d414ad5fc39c9ddcde46b0d6a6435c"
    end
  end

  def install
    bin.install "markswift"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/markswift --version")
  end
end
