"""The Bluesky Feed integration."""
from __future__ import annotations

import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.helpers import entity_registry as er

from .const import DOMAIN
from .coordinator import BlueskyFeedCoordinator

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]

SERVICE_LIKE_SCHEMA = vol.Schema(
    {
        vol.Required("entity_id"): str,
        vol.Required("uri"): str,
        vol.Required("cid"): str,
    }
)

SERVICE_UNLIKE_SCHEMA = vol.Schema(
    {
        vol.Required("entity_id"): str,
        vol.Required("record_uri"): str,
    }
)

SERVICE_REPOST_SCHEMA = vol.Schema(
    {
        vol.Required("entity_id"): str,
        vol.Required("uri"): str,
        vol.Required("cid"): str,
    }
)

SERVICE_UNREPOST_SCHEMA = vol.Schema(
    {
        vol.Required("entity_id"): str,
        vol.Required("record_uri"): str,
    }
)


def _get_coordinator(
    hass: HomeAssistant, entity_id: str
) -> BlueskyFeedCoordinator:
    """Resolve a coordinator from an entity_id."""
    registry = er.async_get(hass)
    entry = registry.async_get(entity_id)
    if entry is None:
        raise ValueError(f"Entity not found: {entity_id}")
    config_entry_id = entry.config_entry_id
    coordinator = hass.data[DOMAIN].get(config_entry_id)
    if coordinator is None:
        raise ValueError(
            f"No coordinator for config entry: {config_entry_id}"
        )
    return coordinator


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry
) -> bool:
    """Set up Bluesky Feed from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    # Register the frontend card static path (once)
    if "frontend_loaded" not in hass.data[DOMAIN]:
        card_path = str(Path(__file__).parent / "www" / "bluesky-feed-card.js")
        card_url = "/bluesky_feed/bluesky-feed-card.js"

        from homeassistant.components.http import StaticPathConfig

        await hass.http.async_register_static_paths(
            [StaticPathConfig(card_url, card_path, False)]
        )
        hass.data[DOMAIN]["frontend_loaded"] = True

    # Register services (once)
    if "services_registered" not in hass.data[DOMAIN]:

        async def handle_like(call: ServiceCall):
            coord = _get_coordinator(hass, call.data["entity_id"])
            uri = await coord.async_like_post(
                call.data["uri"], call.data["cid"]
            )
            return {"record_uri": uri}

        async def handle_unlike(call: ServiceCall):
            coord = _get_coordinator(hass, call.data["entity_id"])
            await coord.async_unlike_post(call.data["record_uri"])

        async def handle_repost(call: ServiceCall):
            coord = _get_coordinator(hass, call.data["entity_id"])
            uri = await coord.async_repost_post(
                call.data["uri"], call.data["cid"]
            )
            return {"record_uri": uri}

        async def handle_unrepost(call: ServiceCall):
            coord = _get_coordinator(hass, call.data["entity_id"])
            await coord.async_unrepost_post(call.data["record_uri"])

        hass.services.async_register(
            DOMAIN,
            "like",
            handle_like,
            schema=SERVICE_LIKE_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )
        hass.services.async_register(
            DOMAIN,
            "unlike",
            handle_unlike,
            schema=SERVICE_UNLIKE_SCHEMA,
        )
        hass.services.async_register(
            DOMAIN,
            "repost",
            handle_repost,
            schema=SERVICE_REPOST_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )
        hass.services.async_register(
            DOMAIN,
            "unrepost",
            handle_unrepost,
            schema=SERVICE_UNREPOST_SCHEMA,
        )
        hass.data[DOMAIN]["services_registered"] = True

    coordinator = BlueskyFeedCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()

    hass.data[DOMAIN][entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(
        entry.add_update_listener(_async_update_listener)
    )

    return True


async def async_unload_entry(
    hass: HomeAssistant, entry: ConfigEntry
) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(
        entry, PLATFORMS
    )
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unload_ok


async def _async_update_listener(
    hass: HomeAssistant, entry: ConfigEntry
) -> None:
    """Handle options update."""
    await hass.config_entries.async_reload(entry.entry_id)
