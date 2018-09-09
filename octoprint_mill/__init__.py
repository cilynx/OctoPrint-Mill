# coding=utf-8
from __future__ import absolute_import

import octoprint.plugin

class MillPlugin(octoprint.plugin.TemplatePlugin,
        octoprint.plugin.SettingsPlugin,
        octoprint.plugin.AssetPlugin):

    def get_settings_defaults(self):
        return dict(text="Milling")

    def get_template_configs(self):
        return [
                dict(type="settings", custom_bindings=False),
                dict(type="tab", replaces="temperature")
                ]

    def get_assets(self):
        return dict(js=["js/mill.js"])

__plugin_name__ = "Mill"
__plugin_implementation__ = MillPlugin()
