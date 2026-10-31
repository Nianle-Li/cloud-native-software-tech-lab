-- Match the Java 17 RequestText.isBlank character set for required text.
-- Generated from Character.isWhitespace, Character.isSpaceChar and Character.FORMAT.
-- Keep this set in sync if the API's Java version or blank-text policy changes.
CREATE FUNCTION booking_has_visible_text(value TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE STRICT PARALLEL SAFE
AS $$
    SELECT translate(value,
        U&'\0009\000A\000B\000C\000D\001C\001D\001E\001F\0020\00A0\00AD\0600\0601\0602\0603\0604\0605\061C\06DD'
        || U&'\070F\08E2\1680\180E\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\200B\200C\200D\200E\200F'
        || U&'\2028\2029\202A\202B\202C\202D\202E\202F\205F\2060\2061\2062\2063\2064\2066\2067\2068\2069\206A\206B'
        || U&'\206C\206D\206E\206F\3000\FEFF\FFF9\FFFA\FFFB\+0110BD\+0110CD\+013430\+013431\+013432\+013433\+013434\+013435\+013436\+013437\+013438'
        || U&'\+01BCA0\+01BCA1\+01BCA2\+01BCA3\+01D173\+01D174\+01D175\+01D176\+01D177\+01D178\+01D179\+01D17A\+0E0001\+0E0020\+0E0021\+0E0022\+0E0023\+0E0024\+0E0025\+0E0026'
        || U&'\+0E0027\+0E0028\+0E0029\+0E002A\+0E002B\+0E002C\+0E002D\+0E002E\+0E002F\+0E0030\+0E0031\+0E0032\+0E0033\+0E0034\+0E0035\+0E0036\+0E0037\+0E0038\+0E0039\+0E003A'
        || U&'\+0E003B\+0E003C\+0E003D\+0E003E\+0E003F\+0E0040\+0E0041\+0E0042\+0E0043\+0E0044\+0E0045\+0E0046\+0E0047\+0E0048\+0E0049\+0E004A\+0E004B\+0E004C\+0E004D\+0E004E'
        || U&'\+0E004F\+0E0050\+0E0051\+0E0052\+0E0053\+0E0054\+0E0055\+0E0056\+0E0057\+0E0058\+0E0059\+0E005A\+0E005B\+0E005C\+0E005D\+0E005E\+0E005F\+0E0060\+0E0061\+0E0062'
        || U&'\+0E0063\+0E0064\+0E0065\+0E0066\+0E0067\+0E0068\+0E0069\+0E006A\+0E006B\+0E006C\+0E006D\+0E006E\+0E006F\+0E0070\+0E0071\+0E0072\+0E0073\+0E0074\+0E0075\+0E0076'
        || U&'\+0E0077\+0E0078\+0E0079\+0E007A\+0E007B\+0E007C\+0E007D\+0E007E\+0E007F',
        '') <> '';
$$;

-- Reusing the existing names keeps constraint diagnostics stable.
-- Adding validated constraints also rejects any pre-existing invalid rows.
ALTER TABLE venues
    DROP CONSTRAINT ck_venues_name_not_blank,
    ADD CONSTRAINT ck_venues_name_not_blank CHECK (booking_has_visible_text(name)),
    DROP CONSTRAINT ck_venues_location_not_blank,
    ADD CONSTRAINT ck_venues_location_not_blank CHECK (booking_has_visible_text(location));

ALTER TABLE reservations
    DROP CONSTRAINT ck_reservations_booked_by_not_blank,
    ADD CONSTRAINT ck_reservations_booked_by_not_blank CHECK (booking_has_visible_text(booked_by)),
    DROP CONSTRAINT ck_reservations_purpose_not_blank,
    ADD CONSTRAINT ck_reservations_purpose_not_blank CHECK (booking_has_visible_text(purpose));
