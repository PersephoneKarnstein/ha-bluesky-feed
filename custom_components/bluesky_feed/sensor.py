"""Sensor platform for Bluesky Feed."""
from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    DOMAIN,
    CONF_FEED_TYPE,
    CONF_AUTHOR_HANDLE,
    CONF_FEED_URI,
    FEED_TYPE_AUTHOR,
    FEED_TYPE_CUSTOM,
)
from .coordinator import BlueskyFeedCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Bluesky Feed sensor from a config entry."""
    coordinator: BlueskyFeedCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([BlueskyFeedSensor(coordinator, entry)])


class BlueskyFeedSensor(
    CoordinatorEntity[BlueskyFeedCoordinator], SensorEntity
):
    """Sensor representing a Bluesky feed."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:butterfly"

    def __init__(
        self,
        coordinator: BlueskyFeedCoordinator,
        entry: ConfigEntry,
    ) -> None:
        """Initialize the sensor."""
        super().__init__(coordinator)
        feed_type = entry.data.get(CONF_FEED_TYPE, "timeline")
        author = entry.data.get(CONF_AUTHOR_HANDLE, "")

        feed_uri = entry.data.get(CONF_FEED_URI, "")

        if feed_type == FEED_TYPE_CUSTOM and feed_uri:
            label = feed_uri.rsplit("/", 1)[-1] if "/" in feed_uri else feed_uri
            self._attr_name = f"Bluesky {label}"
            self._attr_unique_id = f"{entry.entry_id}_custom_{label}"
        elif feed_type == FEED_TYPE_AUTHOR and author:
            self._attr_name = f"Bluesky @{author}"
            self._attr_unique_id = f"{entry.entry_id}_author_{author}"
        else:
            self._attr_name = "Bluesky Following"
            self._attr_unique_id = f"{entry.entry_id}_timeline"

        self._entry = entry

    @property
    def native_value(self) -> int:
        """Return the number of posts in the feed."""
        if self.coordinator.data:
            return len(self.coordinator.data)
        return 0

    @property
    def extra_state_attributes(self) -> dict:
        """Return feed posts as attributes."""
        return {
            "posts": self.coordinator.data or [],
            "feed_type": self._entry.data.get(CONF_FEED_TYPE, "timeline"),
        }
