from datetime import date, time

from front_desk.config import parse_hours
from front_desk.parsing import parse_date, parse_period, parse_time, spoken_time

FRI = date(2026, 10, 16)

def test_dates():
    assert parse_date("2026-10-20", FRI) == date(2026, 10, 20)
    assert parse_date("tomorrow", FRI) == date(2026, 10, 17)
    assert parse_date("Monday", FRI) == date(2026, 10, 19)
    assert parse_date("friday", FRI) == FRI
    assert parse_date("next Friday", FRI) == date(2026, 10, 23)
    assert parse_date("October 24th", FRI) == date(2026, 10, 24)
    assert parse_date("the 3rd", FRI) == date(2026, 11, 3)
    assert parse_date("January 5", FRI) == date(2027, 1, 5)
    assert parse_date("someday", FRI) is None

def test_times():
    assert parse_time("2pm") == time(14)
    assert parse_time("2:30 PM") == time(14, 30)
    assert parse_time("12 am") == time(0)
    assert parse_time("14:00") == time(14)
    assert parse_time("3") == time(15)
    assert parse_time("9") == time(9)
    assert parse_time("noonish") is None
    assert parse_period("Saturday afternoon") == (12, 17)
    assert spoken_time(time(13)) == "1 PM"
    assert spoken_time(time(9, 30)) == "9:30 AM"

def test_hours():
    h = parse_hours("mon-fri 09:00-17:00; sat 10:00-14:00")
    assert h.by_day[0] == (540, 1020)
    assert 6 not in h.by_day
    assert "Sun closed" in h.describe()
