import React from 'react';
import {StyleSheet, Text} from 'react-native';
import {HELP_URL, TIPS} from '../core/support';
import {Flex, H2, Label, P, Row, Rule, Small} from '../ui/kit';
import {QrCode} from '../ui/QrCode';
import {AboutView} from './Settings';

const QR = 230;

const t = StyleSheet.create({
  centered: {textAlign: 'center'},
});

/** What CryptoView is, how to get help, and how to thank the author. */
export function SupportView({fontStatus}: {fontStatus: string}) {
  return (
    <>
      <AboutView fontStatus={fontStatus} />
      <Rule />
      <H2>Help and ideas</H2>
      <P>
        CryptoView is fully open source (MIT license): anyone can read and audit
        its code. A question, a bug, or something you would like CryptoView to
        do? Open an issue on the project's page. Pull requests to adapt or
        develop it are welcome.
      </P>
      <QrCode text={HELP_URL} size={QR} />
      <P>
        <Text selectable style={t.centered}>
          {HELP_URL}
        </Text>
      </P>
      <Rule />
      <H2>Support</H2>
      <P>
        CryptoView is free, with no ads and no tracking. If it is useful to you,
        you can buy me a coffee.
      </P>
      <Row>
        {TIPS.map(tip => (
          <Flex key={tip.label}>
            <Label>{tip.label}</Label>
            <QrCode text={tip.address} size={QR} />
            <P>
              <Text selectable style={t.centered}>
                {tip.address}
              </Text>
            </P>
            <Small>On {tip.chains} only.</Small>
          </Flex>
        ))}
      </Row>
      <Small>
        Check the first and last characters on the other device before sending.
        A coin sent on another network may be lost.
      </Small>
    </>
  );
}
