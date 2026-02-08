"""Config flow for Bluesky Feed integration."""
from __future__ import annotations

import logging
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult

from .const import (
    DOMAIN,
    PDSHOST,
    CONF_HANDLE,
    CONF_PASSWORD,
    CONF_FEED_TYPE,
    CONF_AUTHOR_HANDLE,
    CONF_FEED_URI,
    CONF_POST_LIMIT,
    CONF_UPDATE_INTERVAL,
    FEED_TYPE_TIMELINE,
    FEED_TYPE_AUTHOR,
    FEED_TYPE_CUSTOM,
    DEFAULT_POST_LIMIT,
    DEFAULT_UPDATE_INTERVAL,
)

_LOGGER = logging.getLogger(__name__)


class BlueskyFeedConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Bluesky Feed."""

    VERSION = 1

    def __init__(self) -> None:
        """Initialize."""
        self._data: dict[str, Any] = {}

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the credentials step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            handle = user_input[CONF_HANDLE]
            password = user_input[CONF_PASSWORD]

            if await self._validate_credentials(handle, password):
                self._data[CONF_HANDLE] = handle
                self._data[CONF_PASSWORD] = password
                return await self.async_step_feed_type()
            errors["base"] = "auth"

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_HANDLE): str,
                    vol.Required(CONF_PASSWORD): str,
                }
            ),
            errors=errors,
        )

    async def async_step_feed_type(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle feed type selection."""
        if user_input is not None:
            self._data[CONF_FEED_TYPE] = user_input[CONF_FEED_TYPE]

            if user_input[CONF_FEED_TYPE] == FEED_TYPE_AUTHOR:
                return await self.async_step_author()
            if user_input[CONF_FEED_TYPE] == FEED_TYPE_CUSTOM:
                return await self.async_step_custom_feed()

            return await self.async_step_settings()

        return self.async_show_form(
            step_id="feed_type",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_FEED_TYPE, default=FEED_TYPE_TIMELINE
                    ): vol.In(
                        {
                            FEED_TYPE_TIMELINE: "Following",
                            FEED_TYPE_AUTHOR: "Specific User's Posts",
                            FEED_TYPE_CUSTOM: "Custom Feed URL",
                        }
                    ),
                }
            ),
        )

    async def async_step_author(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle author handle input."""
        if user_input is not None:
            self._data[CONF_AUTHOR_HANDLE] = user_input[CONF_AUTHOR_HANDLE]
            return await self.async_step_settings()

        return self.async_show_form(
            step_id="author",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_AUTHOR_HANDLE): str,
                }
            ),
        )

    async def async_step_custom_feed(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle custom feed URI input."""
        if user_input is not None:
            self._data[CONF_FEED_URI] = user_input[CONF_FEED_URI]
            return await self.async_step_settings()

        return self.async_show_form(
            step_id="custom_feed",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_FEED_URI): str,
                }
            ),
        )

    async def async_step_settings(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle poll interval and post limit settings."""
        if user_input is not None:
            self._data[CONF_UPDATE_INTERVAL] = user_input[CONF_UPDATE_INTERVAL]
            self._data[CONF_POST_LIMIT] = user_input[CONF_POST_LIMIT]
            return self.async_create_entry(
                title=self._build_title(),
                data=self._data,
            )

        return self.async_show_form(
            step_id="settings",
            data_schema=vol.Schema(
                {
                    vol.Optional(
                        CONF_UPDATE_INTERVAL, default=DEFAULT_UPDATE_INTERVAL
                    ): vol.All(
                        vol.Coerce(int), vol.Range(min=30, max=3600)
                    ),
                    vol.Optional(
                        CONF_POST_LIMIT, default=DEFAULT_POST_LIMIT
                    ): vol.All(
                        vol.Coerce(int), vol.Range(min=1, max=50)
                    ),
                }
            ),
        )

    def _build_title(self) -> str:
        """Build the config entry title based on feed type."""
        feed_type = self._data.get(CONF_FEED_TYPE, FEED_TYPE_TIMELINE)
        if feed_type == FEED_TYPE_CUSTOM:
            uri = self._data.get(CONF_FEED_URI, "")
            label = uri.rsplit("/", 1)[-1] if "/" in uri else uri
            return f"Bluesky ({label})"
        if feed_type == FEED_TYPE_AUTHOR:
            author = self._data.get(CONF_AUTHOR_HANDLE, "")
            return f"Bluesky (@{author})"
        return f"Bluesky ({self._data[CONF_HANDLE]})"

    async def _validate_credentials(
        self, handle: str, password: str
    ) -> bool:
        """Validate Bluesky credentials."""
        url = f"{PDSHOST}/xrpc/com.atproto.server.createSession"
        payload = {"identifier": handle, "password": password}

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as resp:
                    return resp.status == 200
        except Exception:
            _LOGGER.exception("Error validating Bluesky credentials")
            return False

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Get the options flow handler."""
        return BlueskyFeedOptionsFlow()


class BlueskyFeedOptionsFlow(config_entries.OptionsFlow):
    """Handle options for Bluesky Feed."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Manage the options."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Optional(
                        CONF_POST_LIMIT,
                        default=self.config_entry.options.get(
                            CONF_POST_LIMIT,
                            self.config_entry.data.get(
                                CONF_POST_LIMIT, DEFAULT_POST_LIMIT
                            ),
                        ),
                    ): vol.All(
                        vol.Coerce(int), vol.Range(min=1, max=50)
                    ),
                    vol.Optional(
                        CONF_UPDATE_INTERVAL,
                        default=self.config_entry.options.get(
                            CONF_UPDATE_INTERVAL,
                            self.config_entry.data.get(
                                CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL
                            ),
                        ),
                    ): vol.All(
                        vol.Coerce(int), vol.Range(min=30, max=3600)
                    ),
                }
            ),
        )
